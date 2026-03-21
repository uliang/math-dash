/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Star, Zap, AlertCircle, Clock as ClockIcon, Volume2, VolumeX, Pause } from 'lucide-react';

type GameState = 'START' | 'PLAYING' | 'GAMEOVER';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface Problem {
  question: string;
  answer: number;
  options: number[];
}

const QUESTIONS_PER_GAME = 20;

const DIFFICULTY_CONFIG = {
  EASY: { label: 'Easy', color: '#6BCB77', multiplier: 1, startTime: 60 },
  MEDIUM: { label: 'Medium', color: '#4D96FF', multiplier: 2, startTime: 90 },
  HARD: { label: 'Hard', color: '#FF6B6B', multiplier: 5, startTime: 120 },
};

const SOUNDS = {
  CORRECT: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3',
  WRONG: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
  GAMEOVER: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3',
};

const Clock = ({ seconds }: { seconds: number }) => {
  const rotation = (seconds % 60) * 6; // 360 / 60 = 6 degrees per second
  return (
    <div className="relative w-24 h-24 bg-white rounded-full border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center overflow-hidden">
      {/* Clock Face */}
      <div className="absolute inset-1 border-2 border-gray-100 rounded-full" />
      {/* Hour Markers (dots) */}
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-gray-300 rounded-full"
          style={{
            transform: `rotate(${i * 30}deg) translateY(-36px)`,
          }}
        />
      ))}
      {/* Hand */}
      <motion.div
        className="absolute w-1 h-10 bg-[#FF6B6B] rounded-full origin-bottom"
        style={{ bottom: '50%' }}
        animate={{ rotate: rotation }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />
      {/* Center Dot */}
      <div className="absolute w-2 h-2 bg-black rounded-full z-10" />
    </div>
  );
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [difficulty, setDifficulty] = useState<Difficulty>('EASY');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('math-dash-highscore');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [solvedCount, setSolvedCount] = useState(0);
  const [timeBonus, setTimeBonus] = useState(0);
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [feedback, setFeedback] = useState<'CORRECT' | 'WRONG' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const playSound = useCallback((url: string) => {
    if (isMuted) return;
    const audio = new Audio(url);
    audio.play().catch(e => console.log('Audio play blocked:', e));
  }, [isMuted]);

  // High score tracking
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('math-dash-highscore', score.toString());
    }
  }, [score, highScore]);

  // Game over check
  useEffect(() => {
    if (timeLeft <= 0 && gameState === 'PLAYING') {
      endGame(false);
    }
  }, [timeLeft, gameState]);

  const generateProblem = useCallback((diff: Difficulty): Problem => {
    let a, b, op, answer;
    
    switch (diff) {
      case 'EASY':
        op = '+';
        a = Math.floor(Math.random() * 9) + 1;
        b = Math.floor(Math.random() * 9) + 1;
        break;
      case 'MEDIUM':
        op = Math.random() > 0.5 ? '+' : '-';
        a = Math.floor(Math.random() * 90) + 10;
        b = Math.floor(Math.random() * 90) + 10;
        if (op === '-' && a < b) [a, b] = [b, a];
        break;
      case 'HARD':
        const randOp = Math.random();
        if (randOp < 0.33) op = '+';
        else if (randOp < 0.66) op = '-';
        else op = '*';
        
        if (op === '*') {
          a = Math.floor(Math.random() * 10) + 2;
          b = Math.floor(Math.random() * 50) + 10;
        } else {
          a = Math.floor(Math.random() * 900) + 100;
          b = Math.floor(Math.random() * 900) + 100;
          if (op === '-' && a < b) [a, b] = [b, a];
        }
        break;
    }

    switch (op) {
      case '+': answer = a + b; break;
      case '-': answer = a - b; break;
      case '*': answer = a * b; break;
      default: answer = a + b;
    }

    const options = [answer];
    while (options.length < 3) {
      const range = diff === 'HARD' ? 50 : 10;
      const distractor = answer + (Math.floor(Math.random() * range) - (range / 2));
      if (distractor !== answer && distractor > 0 && !options.includes(distractor)) {
        options.push(distractor);
      }
    }

    return {
      question: `${a} ${op} ${b}`,
      answer,
      options: options.sort(() => Math.random() - 0.5),
    };
  }, []);

  const startGame = (selectedDiff: Difficulty = 'EASY') => {
    setDifficulty(selectedDiff);
    setScore(0);
    setTimeLeft(DIFFICULTY_CONFIG[selectedDiff].startTime);
    setSolvedCount(0);
    setTimeBonus(0);
    setGameState('PLAYING');
    setIsPaused(false);
    setCurrentProblem(generateProblem(selectedDiff));
    setFeedback(null);
  };

  const endGame = (completed: boolean) => {
    let finalBonus = 0;
    if (completed) {
      finalBonus = Math.floor(timeLeft * 10 * DIFFICULTY_CONFIG[difficulty].multiplier);
      setTimeBonus(finalBonus);
      setScore(prev => prev + finalBonus);
    }
    setGameState('GAMEOVER');
    playSound(SOUNDS.GAMEOVER);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleAnswer = (selected: number) => {
    if (feedback || isPaused) return;

    if (selected === currentProblem?.answer) {
      setFeedback('CORRECT');
      playSound(SOUNDS.CORRECT);
      const points = 10 * DIFFICULTY_CONFIG[difficulty].multiplier;
      setScore(prev => prev + points);
      
      const nextSolvedCount = solvedCount + 1;
      setSolvedCount(nextSolvedCount);
      
      setTimeout(() => {
        if (nextSolvedCount >= QUESTIONS_PER_GAME) {
          endGame(true);
        } else {
          setFeedback(null);
          setCurrentProblem(generateProblem(difficulty));
        }
      }, 600);
    } else {
      setFeedback('WRONG');
      playSound(SOUNDS.WRONG);
      setTimeLeft(prev => Math.max(0, prev - 5));
      
      setTimeout(() => {
        setFeedback(null);
        setCurrentProblem(generateProblem(difficulty));
      }, 800);
    }
  };

  // Countdown timer
  useEffect(() => {
    if (gameState === 'PLAYING' && !isPaused) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, isPaused]);

  return (
    <div className="min-h-screen bg-[#FFD93D] flex flex-col items-center justify-center p-4 select-none">
      {/* Background Jazzy Shapes */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-10 left-10 w-32 h-32 bg-[#FF6B6B] rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-48 h-48 bg-[#4D96FF] rounded-full blur-3xl animate-bounce" />
        <div className="absolute top-1/2 left-1/4 w-24 h-24 bg-[#6BCB77] rotate-45 blur-2xl" />
      </div>

      <AnimatePresence mode="wait">
        {gameState === 'START' && (
          <motion.div
            key="start"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="bg-white p-8 rounded-[40px] shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] border-4 border-black text-center max-w-md w-full relative z-10"
          >
            <h1 className="text-6xl font-display mb-4 text-[#FF6B6B] drop-shadow-lg leading-tight">
              MATH<br/>DASH!
            </h1>
            <p className="text-xl mb-8 text-gray-700 font-semibold">
              Solve {QUESTIONS_PER_GAME} questions as fast as you can! Wrong answers cost 5 seconds.
            </p>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3">
                {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => startGame(diff)}
                    style={{ backgroundColor: DIFFICULTY_CONFIG[diff].color }}
                    className="group relative text-white font-display text-2xl py-4 rounded-2xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex items-center justify-center gap-3"
                  >
                    <Play className="w-6 h-6 fill-current" />
                    {DIFFICULTY_CONFIG[diff].label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center gap-6 mt-2">
                {highScore > 0 && (
                  <div className="flex items-center justify-center gap-2 text-[#4D96FF] font-display text-xl">
                    <Trophy className="w-6 h-6" />
                    BEST: {highScore}
                  </div>
                )}
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-3 bg-white rounded-2xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                >
                  {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'PLAYING' && (
          <motion.div
            key="playing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl relative z-10"
          >
            {/* HUD */}
            <div className="flex justify-between items-center mb-8 gap-4">
              <div className="bg-white px-6 py-3 rounded-2xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="text-xs font-display text-gray-400 uppercase tracking-widest">Score</div>
                <motion.div 
                  key={score}
                  initial={{ scale: 1.2, color: '#4D96FF' }}
                  animate={{ scale: 1, color: '#4D96FF' }}
                  className="text-4xl font-display tabular-nums"
                >
                  {score}
                </motion.div>
              </div>
              
              <div className="flex flex-col items-center">
                <motion.div
                  animate={timeLeft <= 10 ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <Clock seconds={timeLeft} />
                </motion.div>
                <div className={`mt-2 px-4 py-1 rounded-full border-2 border-black font-display text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                  timeLeft <= 10 ? 'bg-[#FF6B6B] text-white animate-pulse' : 'bg-[#FFD93D] text-black'
                }`}>
                  <motion.span
                    key={timeLeft}
                    initial={{ opacity: 0.5, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    {timeLeft}s
                  </motion.span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    className="bg-white p-2 rounded-xl border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                  >
                    {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
                  </button>
                  <div className="bg-white px-4 py-2 rounded-xl border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-display text-xs flex items-center">
                    {solvedCount}/{QUESTIONS_PER_GAME}
                  </div>
                </div>
                <button
                  onClick={() => endGame(false)}
                  className="bg-[#FF6B6B] px-4 py-2 rounded-2xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-[#ff5252] text-white font-display text-sm active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                >
                  STOP
                </button>
              </div>
            </div>

            {/* Problem Card */}
            <div className="bg-white rounded-[40px] border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] p-12 mb-8 text-center relative overflow-hidden">
              <AnimatePresence mode="wait">
                {!isPaused ? (
                  <motion.div
                    key={currentProblem?.question}
                    initial={{ y: 20, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -20, opacity: 0, scale: 1.1 }}
                    transition={{ type: 'spring', damping: 12 }}
                    className="text-8xl font-display text-black mb-4"
                  >
                    {currentProblem?.question}
                  </motion.div>
                ) : (
                  <motion.div
                    key="paused"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-6xl font-display text-[#4D96FF] py-8"
                  >
                    PAUSED
                  </motion.div>
                )}
              </AnimatePresence>
              
              {!isPaused && (
                <div className="text-2xl font-semibold text-gray-400 font-display">
                  = ?
                </div>
              )}

              {/* Feedback Overlay */}
              <AnimatePresence>
                {feedback && !isPaused && (
                  <motion.div
                    initial={{ scale: 0, rotate: -20, opacity: 0 }}
                    animate={{ scale: 1.2, rotate: 0, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className={`absolute inset-0 flex items-center justify-center pointer-events-none z-20`}
                  >
                    <div className={`text-6xl font-display px-8 py-4 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] ${
                      feedback === 'CORRECT' ? 'bg-[#6BCB77] text-white' : 'bg-[#FF6B6B] text-white'
                    }`}>
                      {feedback === 'CORRECT' ? 'AWESOME!' : 'OOPS!'}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Options */}
            <div className="grid grid-cols-3 gap-4">
              {currentProblem?.options.map((option, idx) => (
                <motion.button
                  key={`${currentProblem.question}-${option}-${idx}`}
                  whileHover={!isPaused ? { scale: 1.05, y: -5 } : {}}
                  whileTap={!isPaused ? { scale: 0.95 } : {}}
                  onClick={() => handleAnswer(option)}
                  disabled={!!feedback || isPaused}
                  className={`bg-white py-6 rounded-3xl border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-4xl font-display transition-all hover:bg-gray-50 disabled:opacity-50 ${
                    feedback === 'CORRECT' && option === currentProblem.answer ? 'bg-[#6BCB77] text-white' : 
                    feedback === 'WRONG' && option !== currentProblem.answer ? 'bg-gray-100' : ''
                  } ${isPaused ? 'cursor-not-allowed grayscale' : ''}`}
                >
                  {option}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {gameState === 'GAMEOVER' && (
          <motion.div
            key="gameover"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-10 rounded-[40px] shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] border-4 border-black text-center max-w-md w-full relative z-10"
          >
            <div className="mb-6 inline-block p-4 bg-[#FF6B6B] rounded-full border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <AlertCircle className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-5xl font-display mb-2 text-black">TIME'S UP!</h2>
            <p className="text-xl text-gray-500 font-semibold mb-8">
              Great effort!
            </p>
            
            <div className="bg-gray-50 rounded-3xl p-6 border-4 border-black mb-8">
              <div className="flex justify-between items-center mb-2">
                <span className="font-display text-gray-400">BASE SCORE</span>
                <span className="font-display text-2xl text-black">{score - timeBonus}</span>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="font-display text-gray-400">TIME BONUS</span>
                <span className="font-display text-2xl text-[#6BCB77]">+{timeBonus}</span>
              </div>
              <div className="h-1 bg-black/10 mb-4" />
              <div className="flex justify-between items-center mb-4">
                <span className="font-display text-gray-400">FINAL SCORE</span>
                <span className="font-display text-4xl text-[#4D96FF]">{score}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-display text-gray-400">SOLVED</span>
                <span className="font-display text-2xl text-[#6BCB77]">{solvedCount}/{QUESTIONS_PER_GAME}</span>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => startGame(difficulty)}
                className="bg-[#6BCB77] hover:bg-[#5db868] text-white font-display text-2xl py-5 rounded-2xl border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex items-center justify-center gap-3"
              >
                <RotateCcw className="w-6 h-6" />
                TRY AGAIN
              </button>
              <button
                onClick={() => setGameState('START')}
                className="text-gray-400 font-display hover:text-black transition-colors"
              >
                BACK TO MENU
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Particles */}
      {gameState === 'PLAYING' && (
        <div className="fixed inset-0 pointer-events-none">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ y: '100vh', x: Math.random() * 100 + 'vw' }}
              animate={{ y: '-10vh' }}
              transition={{ duration: Math.random() * 5 + 5, repeat: Infinity, ease: 'linear' }}
              className="absolute"
            >
              <Star className={`w-8 h-8 fill-current ${['text-[#FF6B6B]', 'text-[#4D96FF]', 'text-[#6BCB77]', 'text-[#FFD93D]'][i % 4]}`} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
