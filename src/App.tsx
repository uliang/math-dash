/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Star, Zap, AlertCircle, Volume2, VolumeX, Pause, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';

type GameState = 'START' | 'PLAYING' | 'GAMEOVER';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface Problem {
  question: string;
  answer: number;
  options: number[];
}

const QUESTIONS_PER_LEVEL = 5;

const DIFFICULTY_CONFIG = {
  EASY: { label: 'Easy', color: '#6BCB77', multiplier: 1 },
  MEDIUM: { label: 'Medium', color: '#4D96FF', multiplier: 2 },
  HARD: { label: 'Hard', color: '#FF6B6B', multiplier: 5 },
};

const BASE_START_TIME = 30;

const SOUNDS = {
  CORRECT: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3',
  WRONG: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
  GAMEOVER: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3',
  BOOM: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
  BGM: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
};

const FuseProgressBar = ({ current, total }: { current: number; total: number }) => {
  const percentage = (current / total) * 100;
  
  return (
    <div className="w-full max-w-md h-8 bg-gray-200 rounded-full border-4 border-black relative overflow-visible shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      {/* The Fuse Line */}
      <motion.div 
        className="h-full bg-[#8B4513] rounded-full origin-left"
        initial={{ width: '100%' }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.5 }}
      />
      
      {/* The Spark/Flame */}
      <motion.div 
        className="absolute top-1/2 -translate-y-1/2 z-10"
        animate={{ 
          left: `${percentage}%`,
          scale: [1, 1.2, 1],
          rotate: [0, 10, -10, 0]
        }}
        transition={{ 
          left: { duration: 0.5 },
          scale: { repeat: Infinity, duration: 0.2 },
          rotate: { repeat: Infinity, duration: 0.3 }
        }}
        style={{ marginLeft: '-12px' }}
      >
        <div className="relative">
          <Zap className="w-8 h-8 text-[#FFD93D] fill-current drop-shadow-[0_0_8px_rgba(255,217,61,0.8)]" />
          <div className="absolute top-0 left-0 w-8 h-8 bg-[#FF6B6B] rounded-full blur-md opacity-50 animate-pulse" />
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [difficulty, setDifficulty] = useState<Difficulty>('EASY');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(BASE_START_TIME);
  const [maxTime, setMaxTime] = useState(BASE_START_TIME);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('math-boom-highscore');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [level, setLevel] = useState(1);
  const [solvedInLevel, setSolvedInLevel] = useState(0);
  const [totalSolved, setTotalSolved] = useState(0);
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [feedback, setFeedback] = useState<'CORRECT' | 'WRONG' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  const getStartTimeForLevel = (lvl: number) => {
    // Fuse burns faster as level increases
    return Math.max(8, BASE_START_TIME - (lvl - 1) * 2);
  };

  // Background Music Control
  useEffect(() => {
    if (!bgmRef.current) {
      // Using a royalty-free jazzy loop
      bgmRef.current = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
      bgmRef.current.loop = true;
      bgmRef.current.volume = 0.3;
    }

    const bgm = bgmRef.current;

    if (gameState === 'PLAYING' && !isPaused && !isMuted && !showLevelComplete) {
      bgm.play().catch(e => console.log('BGM play blocked:', e));
    } else {
      bgm.pause();
    }

    return () => {
      bgm.pause();
    };
  }, [gameState, isPaused, isMuted, showLevelComplete]);

  const playSound = useCallback((url: string) => {
    if (isMuted) return;
    const audio = new Audio(url);
    audio.play().catch(e => console.log('Audio play blocked:', e));
  }, [isMuted]);

  // High score tracking
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('math-boom-highscore', score.toString());
    }
  }, [score, highScore]);

  // Game over check
  useEffect(() => {
    if (timeLeft <= 0 && gameState === 'PLAYING' && !showLevelComplete) {
      endGame(true); // True means it was a boom
    }
  }, [timeLeft, gameState, showLevelComplete]);

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
        // Single and double digit numbers
        a = Math.floor(Math.random() * 99) + 1;
        b = Math.floor(Math.random() * 99) + 1;
        if (op === '-' && a < b) [a, b] = [b, a];
        break;
      case 'HARD':
        const randOp = Math.random();
        if (randOp < 0.33) op = '+';
        else if (randOp < 0.66) op = '-';
        else op = '*';
        
        // Double digit numbers
        a = Math.floor(Math.random() * 90) + 10;
        b = Math.floor(Math.random() * 90) + 10;
        if (op === '*' && (a > 20 || b > 20)) {
          // Keep multiplication slightly manageable but still double digits
          a = Math.floor(Math.random() * 15) + 10;
          b = Math.floor(Math.random() * 15) + 10;
        }
        if (op === '-' && a < b) [a, b] = [b, a];
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
      const range = diff === 'HARD' ? 100 : 20;
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
    const initialTime = getStartTimeForLevel(1);
    setTimeLeft(initialTime);
    setMaxTime(initialTime);
    setSolvedInLevel(0);
    setTotalSolved(0);
    setLevel(1);
    setShowLevelComplete(false);
    setGameState('PLAYING');
    setIsPaused(false);
    setCurrentProblem(generateProblem(selectedDiff));
    setFeedback(null);
  };

  const endGame = (isBoom: boolean = false) => {
    setGameState('GAMEOVER');
    if (isBoom) {
      playSound(SOUNDS.BOOM);
    } else {
      playSound(SOUNDS.GAMEOVER);
    }
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const startNextLevel = () => {
    const nextLevel = level + 1;
    setLevel(nextLevel);
    setSolvedInLevel(0);
    const nextTime = getStartTimeForLevel(nextLevel);
    setTimeLeft(nextTime);
    setMaxTime(nextTime);
    setShowLevelComplete(false);
    setCurrentProblem(generateProblem(difficulty));
    setFeedback(null);
  };

  const handleAnswer = useCallback((selected: number) => {
    if (feedback || isPaused || showLevelComplete) return;

    if (selected === currentProblem?.answer) {
      setFeedback('CORRECT');
      playSound(SOUNDS.CORRECT);
      const points = 10 * DIFFICULTY_CONFIG[difficulty].multiplier;
      setScore(prev => prev + points);
      
      const nextSolvedInLevel = solvedInLevel + 1;
      setSolvedInLevel(nextSolvedInLevel);
      setTotalSolved(prev => prev + 1);
      
      setTimeout(() => {
        if (nextSolvedInLevel >= QUESTIONS_PER_LEVEL) {
          setShowLevelComplete(true);
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D']
          });
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
  }, [feedback, isPaused, showLevelComplete, currentProblem, difficulty, solvedInLevel, playSound, generateProblem]);

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'PLAYING' || isPaused || showLevelComplete || feedback) return;
      
      if (currentProblem && ['1', '2', '3'].includes(e.key)) {
        const index = parseInt(e.key, 10) - 1;
        const option = currentProblem.options[index];
        if (option !== undefined) {
          handleAnswer(option);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, isPaused, showLevelComplete, feedback, currentProblem, handleAnswer]);

  // Countdown timer
  useEffect(() => {
    if (gameState === 'PLAYING' && !isPaused && !showLevelComplete) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, isPaused, showLevelComplete]);

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
              MATH<br/>BOOM!
            </h1>
            <p className="text-xl mb-8 text-gray-700 font-semibold">
              Survive the levels! Each level has {QUESTIONS_PER_LEVEL} questions. The fuse burns faster every level!
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
            <div className="flex flex-col gap-6 mb-8">
              <div className="flex justify-between items-center gap-4">
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

                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsPaused(!isPaused)}
                      className="bg-white p-2 rounded-xl border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                    >
                      {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
                    </button>
                    <div className="bg-white px-4 py-2 rounded-xl border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-display text-xs flex items-center">
                      LVL {level}: {solvedInLevel}/{QUESTIONS_PER_LEVEL}
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

              <div className="flex flex-col items-center gap-2">
                <FuseProgressBar current={timeLeft} total={maxTime} />
                <div className={`px-4 py-1 rounded-full border-2 border-black font-display text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                  timeLeft <= 5 ? 'bg-[#FF6B6B] text-white animate-pulse' : 'bg-[#FFD93D] text-black'
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
            </div>

            {/* Problem Card */}
            <div className="bg-white rounded-[40px] border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] p-12 mb-8 text-center relative overflow-hidden min-h-[300px] flex flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                {showLevelComplete ? (
                  <motion.div
                    key="level-complete"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.5, opacity: 0 }}
                    className="flex flex-col items-center gap-4"
                  >
                    <CheckCircle2 className="w-20 h-20 text-[#6BCB77]" />
                    <h2 className="text-4xl font-display text-black">LEVEL {level} COMPLETE!</h2>
                    <button
                      onClick={startNextLevel}
                      className="bg-[#6BCB77] hover:bg-[#5db868] text-white font-display text-2xl px-8 py-4 rounded-2xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                    >
                      NEXT LEVEL
                    </button>
                  </motion.div>
                ) : !isPaused ? (
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
              
              {!isPaused && !showLevelComplete && (
                <div className="text-2xl font-semibold text-gray-400 font-display">
                  = ?
                </div>
              )}

              {/* Feedback Overlay */}
              <AnimatePresence>
                {feedback && !isPaused && !showLevelComplete && (
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
                  whileHover={!isPaused && !showLevelComplete ? { scale: 1.05, y: -5 } : {}}
                  whileTap={!isPaused && !showLevelComplete ? { scale: 0.95 } : {}}
                  onClick={() => handleAnswer(option)}
                  disabled={!!feedback || isPaused || showLevelComplete}
                  className={`bg-white py-6 rounded-3xl border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-4xl font-display transition-all hover:bg-gray-50 disabled:opacity-50 relative ${
                    feedback === 'CORRECT' && option === currentProblem.answer ? 'bg-[#6BCB77] text-white' : 
                    feedback === 'WRONG' && option !== currentProblem.answer ? 'bg-gray-100' : ''
                  } ${(isPaused || showLevelComplete) ? 'cursor-not-allowed grayscale' : ''}`}
                >
                  <span className="absolute top-2 left-3 text-xs text-gray-400 font-display opacity-50">
                    {idx + 1}
                  </span>
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
            <div className="mb-6 relative inline-block">
              <div className="p-4 bg-[#FF6B6B] rounded-full border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative z-10">
                <AlertCircle className="w-12 h-12 text-white" />
              </div>
              <motion.img 
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 2, opacity: 1 }}
                src="https://picsum.photos/seed/explosion/200/200"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full object-cover border-4 border-black z-0"
                referrerPolicy="no-referrer"
              />
            </div>
            <h2 className="text-5xl font-display mb-2 text-black mt-8">BOOM!</h2>
            <p className="text-xl text-gray-500 font-semibold mb-8">
              The fuse ran out!
            </p>
            
            <div className="bg-gray-50 rounded-3xl p-6 border-4 border-black mb-8">
              <div className="flex justify-between items-center mb-4">
                <span className="font-display text-gray-400">FINAL SCORE</span>
                <span className="font-display text-4xl text-[#4D96FF]">{score}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-display text-gray-400">TOTAL SOLVED</span>
                <span className="font-display text-2xl text-[#6BCB77]">{totalSolved}</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="font-display text-gray-400">REACHED LEVEL</span>
                <span className="font-display text-2xl text-[#FF6B6B]">{level}</span>
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
