import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    doc,
    addDoc,
    setDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    deleteDoc
} from 'firebase/firestore';
import {
    Activity, History, Clipboard, Trash2, Settings, X, Save, RotateCcw,
    Trophy, Calendar, ChevronRight, ChevronLeft, CheckCircle2,
    Clock, PlayCircle, PauseCircle, StopCircle, Undo2,
    Upload, AlertTriangle, Layout, Palette, Share2, Download, User, Eye, Sparkles, Copy, FileText, HelpCircle, FileQuestion
} from 'lucide-react';

import html2canvas from 'html2canvas';
import confetti from 'canvas-confetti';
import { generateRecap } from './utils/recapGenerator';

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase only if config is present to avoid errors during initial setup
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.warn("Firebase not initialized. Please check .env.local");
}

// --- Constants & Defaults ---
const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'stat-tracker-v1';

const DEFAULT_THEME = {
    bg: '#1a0b2e',
    card: '#2d1b4e',
    accent: '#fbbf24', // Yellow-400
    text: '#ffffff',
    secondaryText: '#d8b4fe', // Purple-200
    border: '#581c87' // Purple-800
};

const INITIAL_GAME_STATE = {
    currentPeriod: 1,
    points: 0,
    shots: [], // Array of { x, y, result, type, timestamp }
    fgm: 0,
    fga: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    rebounds: 0,
    oreb: 0,
    dreb: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
    periodScores: { 1: 0, 2: 0, 3: 0, 4: 0 },
};

// --- Helpers ---
const adjustColor = (hex, amount) => {
    let color = hex.replace('#', '');
    if (color.length === 3) color = color.split('').map(c => c + c).join('');
    const num = parseInt(color, 16);
    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;
    r = Math.max(Math.min(255, r), 0);
    g = Math.max(Math.min(255, g), 0);
    b = Math.max(Math.min(255, b), 0);
    return '#' + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
};

// --- Components ---

const StatButton = ({ label, subLabel, onClick, theme, type = 'neutral' }) => {
    // Using !important (!bg-...) to override inline styles on click
    let activeClass = "active:brightness-90";
    if (type === 'positive') activeClass = "active:!bg-green-500 active:!border-green-400 active:!text-white transition-all duration-75";
    if (type === 'negative') activeClass = "active:!bg-red-500 active:!border-red-400 active:!text-white transition-all duration-75";

    return (
        <button
            onClick={onClick}
            style={{
                backgroundColor: theme.accent,
                color: '#1a0b2e'
            }}
            className={`font-bold py-3 px-2 rounded-lg shadow-md transform active:scale-95 flex flex-col items-center justify-center w-full min-h-[80px] hover:brightness-110 ${activeClass}`}
        >
            <span className="text-sm md:text-base uppercase tracking-wider">{label}</span>
            {subLabel && <span className="text-xs opacity-80 mt-1">{subLabel}</span>}
        </button>
    );
};

const MissButton = ({ onClick, text = 'Miss' }) => (
    <button
        onClick={onClick}
        className="bg-gray-700/50 hover:bg-gray-600 active:!bg-red-600 active:!text-white font-bold py-3 px-2 rounded-lg shadow-md transform active:scale-95 transition-all duration-75 flex flex-col items-center justify-center w-full min-h-[80px] border border-transparent"
    >
        <span className="text-3xl md:text-4xl font-black uppercase tracking-tight">{text}</span>
    </button>
);

const ScoreButton = ({ label, subLabel, onClick, theme, type = 'neutral' }) => {
    let activeClass = "active:brightness-90";
    if (type === 'positive') activeClass = "active:!bg-green-500 active:!border-green-400 active:!text-white transition-all duration-75";
    if (type === 'negative') activeClass = "active:!bg-red-500 active:!border-red-400 active:!text-white transition-all duration-75";

    return (
        <button
            onClick={onClick}
            style={{
                backgroundColor: theme.accent,
                color: '#1a0b2e'
            }}
            className={`font-bold py-3 px-2 rounded-lg shadow-md transform active:scale-95 flex flex-col items-center justify-center w-full min-h-[80px] hover:brightness-110 ${activeClass}`}
        >
            <span className="text-3xl md:text-4xl font-black uppercase tracking-tight">{label}</span>
            {subLabel && <span className="text-xs opacity-80 mt-1">{subLabel}</span>}
        </button>
    );
};

const ActionButton = ({ label, onClick, theme, type = 'neutral' }) => {
    let activeClass = "active:bg-purple-600";
    if (type === 'positive') activeClass = "active:!bg-green-600 active:!border-green-500 active:!text-white";
    if (type === 'negative') activeClass = "active:!bg-red-600 active:!border-red-500 active:!text-white";

    return (
        <button
            onClick={onClick}
            style={{ borderColor: theme.border, backgroundColor: `${theme.bg}80` }}
            className={`border text-white text-xs md:text-sm font-semibold py-3 px-1 rounded-lg shadow-sm transition-all duration-75 uppercase hover:brightness-125 transform active:scale-95 ${activeClass}`}
        >
            {label}
        </button>
    );
};

const StatCard = ({ label, value, subtext, theme }) => (
    <div
        style={{ borderColor: theme.border, backgroundColor: 'rgba(0,0,0,0.2)' }}
        className="p-3 rounded-lg border flex flex-col items-center justify-center text-center"
    >
        <span className="text-2xl md:text-3xl font-bold" style={{ color: theme.text }}>{value}</span>
        <span className="text-xs md:text-sm uppercase tracking-wide mt-1" style={{ color: theme.secondaryText }}>{label}</span>
        {subtext && <span className="text-[10px] mt-1 opacity-70" style={{ color: theme.secondaryText }}>{subtext}</span>}
    </div>
);

const PeriodBox = ({ label, score, isActive, onClick, theme }) => (
    <div
        onClick={onClick}
        style={{
            borderColor: isActive ? theme.accent : theme.border,
            backgroundColor: isActive ? theme.accent : 'rgba(0,0,0,0.2)',
            color: isActive ? '#1a0b2e' : theme.secondaryText,
            transform: isActive ? 'scale(1.05)' : 'scale(1)'
        }}
        className="cursor-pointer py-2 px-4 rounded-lg border-2 flex flex-col items-center transition-all shadow-sm"
    >
        <span className="text-xs font-bold uppercase mb-1">{label}</span>
        <span className="text-lg font-black">{score}</span>
    </div>
);

const Court = ({ onShot, shots = [], theme, interactive = false }) => {
    const handleClick = (e) => {
        if (!interactive) return;
        const rect = e.target.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100; // Use rect.height for y-coordinate
        onShot({ x, y });
    };

    return (
        <div className="relative w-full pb-[90%] bg-black/40 rounded-lg border border-white/10 overflow-hidden" onClick={handleClick} style={interactive ? { cursor: 'crosshair' } : {}}>
            {/* Court Markings (simplified) */}
            {/* Court Markings - Interactive fix: pointer-events-none ensures clicks/taps go to the parent div */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Paint */}
                <div className="absolute top-0 left-[35%] w-[30%] h-[40%] border-2 border-white/20 bg-white/5 mx-auto"></div>
                {/* 3PT Line (simplified arc) */}
                <div className="absolute top-0 left-[10%] w-[80%] h-[60%] border-2 border-white/20 rounded-b-full border-t-0"></div>
                {/* Basket - Re-added Hoop */}
                <div className="absolute top-[5%] left-[45%] w-[10%] h-[1%] bg-orange-500 rounded-full shadow-[0_0_10px_rgba(255,165,0,0.5)]"></div>
                <div className="absolute top-[6%] left-[49.5%] w-[1%] h-[2px] bg-white/50"></div>
            </div>

            {/* Shots */}
            {shots.map((shot, i) => (
                <div
                    key={i}
                    className={`absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border border-black/50 shadow-sm transform hover:scale-150 transition-transform ${shot.isMake ? 'bg-green-400' : 'bg-red-400'}`}
                    style={{ left: `${shot.x}%`, top: `${shot.y}%` }}
                    title={`${shot.type} ${shot.isMake ? 'Make' : 'Miss'} - Q${shot.period}`}
                />
            ))}
        </div>
    );
};

const GameDetailsModal = ({ game, onClose, theme }) => {
    if (!game) return null;

    // Helper for safe stat access
    const getStat = (key) => game.stats?.[key] ?? 0;

    // Calculate percentages
    const calcPct = (m, a) => a > 0 ? Math.round((m / a) * 100) : 0;
    const fgPct = calcPct(getStat('fgm'), getStat('fga'));
    const fg3Pct = calcPct(getStat('fg3m'), getStat('fg3a'));
    const ftPct = calcPct(getStat('ftm'), getStat('fta'));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}>
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-start bg-black/20 relative" style={{ borderColor: theme.border }}>
                    <div>
                        <div className="text-xs font-bold opacity-60 uppercase mb-1">{new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <h2 className="text-xl font-black uppercase tracking-tight leading-tight">
                            {game.homeTeam || "My Team"}
                            <span className="opacity-50 mx-2">vs</span>
                            {game.awayTeam}
                        </h2>
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-3xl font-black">{game.finalScore}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${game.outcome === 'Win' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                {game.outcome}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors absolute top-4 right-4">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Period Breakdown */}
                    <div>
                        <h3 className="text-xs font-bold uppercase opacity-60 mb-2">Period Breakdown (Points)</h3>
                        <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 3, 4].map(p => (
                                <div key={p} className="bg-black/20 rounded p-2 text-center border border-white/5">
                                    <div className="text-[10px] opacity-50 uppercase mb-1">Q{p}</div>
                                    <div className="font-bold text-lg" style={{ color: theme.accent }}>
                                        {game.stats?.periodScores?.[p] ?? 0}
                                        <span className="text-[10px] font-normal opacity-50 ml-1">PTS</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Stats List */}
                    <div>
                        <h3 className="text-xs font-bold uppercase opacity-60 mb-3">Full Box Score</h3>
                        <div className="space-y-3">
                            {/* Shooting */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-black/20 rounded p-2 text-center border border-white/5">
                                    <div className="text-[10px] opacity-50 uppercase">FG%</div>
                                    <div className="font-bold">{fgPct}%</div>
                                    <div className="text-[10px] opacity-40">{getStat('fgm')}/{getStat('fga')}</div>
                                </div>
                                <div className="bg-black/20 rounded p-2 text-center border border-white/5">
                                    <div className="text-[10px] opacity-50 uppercase">3PT%</div>
                                    <div className="font-bold">{fg3Pct}%</div>
                                    <div className="text-[10px] opacity-40">{getStat('fg3m')}/{getStat('fg3a')}</div>
                                </div>
                                <div className="bg-black/20 rounded p-2 text-center border border-white/5">
                                    <div className="text-[10px] opacity-50 uppercase">FT%</div>
                                    <div className="font-bold">{ftPct}%</div>
                                    <div className="text-[10px] opacity-40">{getStat('ftm')}/{getStat('fta')}</div>
                                </div>
                            </div>

                            {/* Rebounds Split */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-black/20 rounded-lg p-3 flex justify-between items-center border border-white/5">
                                    <span className="text-xs font-bold opacity-70">Total Reb</span>
                                    <span className="font-bold text-lg">{getStat('rebounds')}</span>
                                </div>
                                <div className="bg-black/20 rounded-lg p-3 flex justify-between items-center border border-white/5">
                                    <span className="text-xs font-bold opacity-70">Off Reb</span>
                                    <span className="font-bold text-lg">{getStat('oreb')}</span>
                                </div>
                                <div className="bg-black/20 rounded-lg p-3 flex justify-between items-center border border-white/5">
                                    <span className="text-xs font-bold opacity-70">Def Reb</span>
                                    <span className="font-bold text-lg">{getStat('dreb')}</span>
                                </div>
                            </div>

                            {/* Main Stats */}
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Points', val: getStat('points') },
                                    { label: 'Assists', val: getStat('assists') },
                                    { label: 'Steals', val: getStat('steals') },
                                    { label: 'Blocks', val: getStat('blocks') },
                                    { label: 'Turnovers', val: getStat('turnovers') },
                                    { label: 'Fouls', val: getStat('fouls') }
                                ].map((s, i) => (
                                    <div key={i} className="bg-black/20 rounded-lg p-3 flex justify-between items-center border border-white/5">
                                        <span className="text-xs font-bold opacity-70 uppercase">{s.label}</span>
                                        <span className="font-bold text-lg" style={{ color: theme.text }}>{s.val}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AIRecapModal = ({ game, onClose, theme, openAIKey, playerName }) => {
    if (!game) return null;

    const [recap, setRecap] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');

    // Helper for safe stat access
    const getStat = (key) => game.stats?.[key] ?? 0;
    const calcPct = (m, a) => a > 0 ? Math.round((m / a) * 100) : 0;
    const fgPct = calcPct(getStat('fgm'), getStat('fga'));

    const handleGenerateRecap = async () => {
        if (!openAIKey) {
            setError("Missing OpenAI API Key. Please add it in Settings.");
            return;
        }
        setIsGenerating(true);
        setError('');

        try {
            const prompt = `
            You are a professional sports journalist. Write a thrilling short game recap article for a basketball game based on the following stats.
            
            Context:
            - Player Name: ${playerName || 'The Player'}
            - Player Team: ${game.homeTeam}
            - Opponent: ${game.awayTeam}
            - Date: ${game.date}
            - Final Score: ${game.finalScore}
            - Outcome: ${game.outcome}
            
            Player Stats (${playerName || 'Hero'}):
            - Points: ${getStat('points')}
            - Rebounds: ${getStat('rebounds')}
            - Assists: ${getStat('assists')}
            - Steals: ${getStat('steals')}
            - 3-Pointers: ${getStat('fg3m')}/${getStat('fg3a')}
            - Shooting: ${fgPct}% FG

            Instructions:
            - Headline: Catchy and professional.
            - Focus: Highlight ${playerName}'s performance.
            - Tone: Exciting, journalistic style.
            - Length: Approx 150 words.
            `;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAIKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            setRecap(data.choices[0].message.content);
        } catch (err) {
            setError(err.message || "Failed to generate recap");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}>
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-black/20" style={{ borderColor: theme.border }}>
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-400" />
                        <h2 className="font-bold text-lg uppercase">AI Game Recap</h2>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 opacity-70 hover:opacity-100" /></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                    {!recap ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 opacity-80">
                            <FileText className="w-12 h-12 mb-4 opacity-50" />
                            <h3 className="font-bold text-lg mb-2">Generate Match Report</h3>
                            <p className="text-sm opacity-60 mb-6 max-w-xs mx-auto">
                                Turn this game's stats into a professional news article using AI.
                            </p>

                            {error && (
                                <div className="mb-4 p-3 bg-red-500/20 text-red-300 text-xs rounded-lg border border-red-500/30">
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleGenerateRecap}
                                disabled={isGenerating}
                                className="py-3 px-8 rounded-full font-bold shadow-lg flex items-center gap-2 hover:brightness-110 disabled:opacity-50 transition-all"
                                style={{ backgroundColor: theme.accent, color: '#1a0b2e' }}
                            >
                                {isGenerating ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                        Writing...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        Generate Story
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-white text-black p-6 rounded-lg font-serif shadow-lg">
                                <div className="whitespace-pre-line leading-relaxed text-sm md:text-base">
                                    {recap}
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(recap);
                                    alert("Copied!");
                                }}
                                className="w-full py-3 rounded-lg font-bold border flex items-center justify-center gap-2 hover:bg-white/5 transition-colors"
                                style={{ borderColor: theme.border, color: theme.text }}
                            >
                                <Copy className="w-4 h-4" /> Copy Text
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function App() {
    const [user, setUser] = useState(null);
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);

    // Theme & Settings
    const [teamColors, setTeamColors] = useState(() => {
        const saved = localStorage.getItem('stat-tracker-colors');
        return saved ? JSON.parse(saved) : { primary: '#2d1b4e', secondary: '#fbbf24' };
    });
    const [playerName, setPlayerName] = useState(() => localStorage.getItem('stat-tracker-player') || 'Player 1');
    const [myTeamName, setMyTeamName] = useState(() => localStorage.getItem('stat-tracker-my-team') || 'My Team');
    const [theme, setTheme] = useState(DEFAULT_THEME);
    const [teamLogo, setTeamLogo] = useState(() => localStorage.getItem('stat-tracker-logo') || null);
    // Saved Opponents List
    const [savedOpponents, setSavedOpponents] = useState(() => {
        try {
            const saved = localStorage.getItem('stat-tracker-opponents');
            return saved ? JSON.parse(saved) || [] : [];
        } catch (e) {
            console.error("Failed to parse opponents", e);
            return [];
        }
    });
    // Google Sheet Integration
    const [googleSheetUrl, setGoogleSheetUrl] = useState(() => localStorage.getItem('stat-tracker-sheet-url') || '');

    const [recipients, setRecipients] = useState(() => {
        const saved = localStorage.getItem('stat-tracker-recipients');
        return saved ? JSON.parse(saved) : [];
    });
    const fileInputRef = useRef(null);

    // Modal States
    const [showHistory, setShowHistory] = useState(false);
    const [showGameDetails, setShowGameDetails] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showTechModal, setShowTechModal] = useState(false);

    // Game State
    const [gameState, setGameState] = useState(INITIAL_GAME_STATE);
    const [historyStack, setHistoryStack] = useState([]);
    const [selectedGame, setSelectedGame] = useState(null); // For Details Modal
    const [selectedRecapGame, setSelectedRecapGame] = useState(null); // For AI Recap Modal

    // Timer State
    const [gameTime, setGameTime] = useState(720); // 12 minutes in seconds
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [timerSettings, setTimerSettings] = useState({ enabled: false, periodLength: 8 }); // Default enabled: false

    // Shot Chart State
    const [shotChartingEnabled, setShotChartingEnabled] = useState(false);
    const [showCourtModal, setShowCourtModal] = useState(false);
    const [pendingShot, setPendingShot] = useState(null);

    // Persistence State
    const [isRestored, setIsRestored] = useState(false);

    // AI Settings
    const [openAIKey, setOpenAIKey] = useState(localStorage.getItem('stat-tracker-openai-key') || '');

    // Form State
    const [gameDetails, setGameDetails] = useState({
        date: new Date().toISOString().split('T')[0],
        homeTeam: myTeamName,
        awayTeam: '',
        notes: '',
        format: 'quarters'
    });

    const [finalResult, setFinalResult] = useState({
        outcome: 'Win',
        homeScore: '',
        awayScore: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [gameToDelete, setGameToDelete] = useState(null);

    // Keep gameDetails.homeTeam in sync with global setting
    useEffect(() => {
        setGameDetails(prev => ({ ...prev, homeTeam: myTeamName }));
    }, [myTeamName]);

    // Settings Tab State
    const [activeSettingsTab, setActiveSettingsTab] = useState('player'); // 'player' | 'team' | 'share'
    const [pendingSubmit, setPendingSubmit] = useState(false);



    // --- Effects ---
    // Auto-calculate outcome
    useEffect(() => {
        const h = parseInt(finalResult.homeScore) || 0;
        const a = parseInt(finalResult.awayScore) || 0;
        // Logic: if My Team (Home) > Opponent (Away) -> Win
        // If names are swapped, logic might differ, but usually 'homeTeam' input is My Team in current UI flow
        let outcome = 'Win';
        if (h > a) outcome = 'Win';
        else if (h < a) outcome = 'Loss';
        else outcome = 'Tie'; // Optional

        setFinalResult(prev => {
            if (prev.outcome !== outcome) return { ...prev, outcome };
            return prev;
        });
    }, [finalResult.homeScore, finalResult.awayScore]);

    useEffect(() => {
        const initAuth = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Auth error:", error);
                alert(`Authentication Error: ${error.code}\n\n${error.message}\n\nTIP: Go to Firebase Console -> Build -> Authentication -> Sign-in method -> Enable 'Anonymous'.`);
            }
        };
        initAuth();

        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            if (!u) setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Sync Game Details Home Team with Global Setting
    useEffect(() => {
        setGameDetails(prev => ({ ...prev, homeTeam: myTeamName }));
    }, [myTeamName]);

    // Expose fetchGames globally or triggering re-render
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const fetchGames = () => setRefreshTrigger(p => p + 1);

    useEffect(() => {
        // Function to load and merge games
        const loadGames = (firestoreGames = []) => {
            let localGames = [];
            try {
                localGames = JSON.parse(localStorage.getItem('stat-tracker-games') || '[]');
                if (!Array.isArray(localGames)) localGames = [];
            } catch (e) {
                console.error("Error parsing local games:", e);
                localGames = [];
            }

            const combined = [...firestoreGames];
            localGames.forEach(localGame => {
                if (!combined.find(g => g.id === localGame.id)) {
                    combined.push(localGame);
                }
            });

            // Sort and Filter
            combined.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0).getTime();
                const dateB = new Date(b.createdAt || 0).getTime();
                return dateB - dateA; // Newest first
            });

            // Remove nulls/invalid
            const safeGames = combined.filter(g => g && g.id && g.stats);
            setGames(safeGames);
        };

        // If no user or no DB, just load local
        if (!user || !db) {
            loadGames([]);
            setLoading(false);
            return;
        }

        const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'games'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const firestoreDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            loadGames(firestoreDocs);
            setLoading(false);
        }, (error) => {
            console.error("Firestore Error:", error);
            // Fallback to purely local if permission denied or offline
            loadGames([]);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user, refreshTrigger]); // Added refreshTrigger dependency

    // Theme color update safely
    useEffect(() => {
        if (!teamColors || !teamColors.primary) return;
        const root = document.querySelector(':root');
        if (root) {
            root.style.setProperty('--primary-color', teamColors.primary);
        }
    }, [teamColors]);

    useEffect(() => {
        let interval = null;
        if (isTimerRunning && gameTime > 0) {
            interval = setInterval(() => {
                setGameTime((prevTime) => prevTime - 1);
            }, 1000);
        } else if (gameTime === 0) {
            setIsTimerRunning(false);
        }
        return () => clearInterval(interval);
    }, [isTimerRunning, gameTime]);

    useEffect(() => {
        const primary = teamColors.primary;
        const secondary = teamColors.secondary;

        const generatedTheme = {
            bg: adjustColor(primary, -60),
            card: primary,
            accent: secondary,
            text: '#ffffff',
            secondaryText: adjustColor(secondary, 100),
            border: adjustColor(primary, 40)
        };
        setTheme(generatedTheme);
    }, [teamColors]);

    // --- Auto-Save Logic ---
    useEffect(() => {
        const activeGame = {
            gameState,
            gameDetails,
            timerSettings,
            gameTime,
            historyStack,
            isTimerRunning,
            shotChartingEnabled,
            pendingReset: false
        };
        // Only save if game is "active" (score > 0 OR time changed from default OR opponent set)
        // AND validation check passed (isRestored is true)
        const isGameActive = gameState.homeScore > 0 || gameState.awayScore > 0 || gameTime !== timerSettings.periodLength * 60 || gameDetails.awayTeam;

        if (isRestored && isGameActive && !showResetConfirm && !showSubmitModal) {
            localStorage.setItem('stat-tracker-active-game', JSON.stringify(activeGame));
        }
    }, [gameState, gameDetails, timerSettings, gameTime, historyStack, isTimerRunning, shotChartingEnabled, isRestored]);

    useEffect(() => {
        const savedGame = localStorage.getItem('stat-tracker-active-game');
        if (savedGame) {
            try {
                const parsed = JSON.parse(savedGame);
                // Basic validation
                if (parsed.gameState && parsed.gameDetails) {
                    console.log("Resuming Active Game session...");
                    setGameState(parsed.gameState);
                    setGameDetails(parsed.gameDetails);
                    if (parsed.timerSettings) setTimerSettings(parsed.timerSettings);
                    if (parsed.gameTime !== undefined) setGameTime(parsed.gameTime);
                    if (parsed.historyStack) setHistoryStack(parsed.historyStack);
                    if (parsed.shotChartingEnabled !== undefined) setShotChartingEnabled(parsed.shotChartingEnabled);
                    // Don't auto-resume timer running state to avoid confusion, keep it paused
                    setIsTimerRunning(false);
                }
            } catch (e) {
                console.error("Failed to restore active game", e);
            }
        }
        // Mark as restored so saves can happen
        setIsRestored(true);
    }, []);

    // --- Logic ---

    const saveStateToHistory = () => {
        setHistoryStack(prev => [...prev, JSON.parse(JSON.stringify(gameState))]);
    };

    const handleUndo = () => {
        if (historyStack.length === 0) return;
        const previousState = historyStack[historyStack.length - 1];
        setGameState(previousState);
        setHistoryStack(prev => prev.slice(0, -1));
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const getTimestamp = () => {
        return timerSettings.enabled ? formatTime(gameTime) : null;
    };

    const handleStatClick = (stat, points = 0, isMake = true, shotValue = 0, location = null) => {
        // If charting is enabled and no location provided, open modal instead of saving
        if (shotChartingEnabled && !location && (shotValue === 2 || shotValue === 3)) {
            setPendingShot({ points: shotValue, isMake, type: `${shotValue}pt` });
            setShowCourtModal(true);
            return;
        }

        saveStateToHistory();
        setGameState(prev => {
            let newPoints = prev.points;
            let currentPeriodScore = prev.periodScores[prev.currentPeriod];
            const updates = { ...prev };

            // Handle scoring stats
            if (stat === 'fgm' || stat === 'fg3m' || stat === 'ftm') {
                newPoints += points;
                currentPeriodScore += points;
                updates.points = newPoints;
                updates.periodScores = { ...prev.periodScores, [prev.currentPeriod]: currentPeriodScore };
                updates[stat] = prev[stat] + 1; // Increment makes
                if (stat === 'fgm') updates.fga = prev.fga + 1;
                if (stat === 'fg3m') updates.fg3a = prev.fg3a + 1;
                if (stat === 'ftm') updates.fta = prev.fta + 1;
            } else if (stat === 'fga' || stat === 'fg3a' || stat === 'fta') {
                updates[stat] = prev[stat] + 1; // Increment attempts for misses
            } else if (stat === 'oreb' || stat === 'dreb') {
                updates[stat] = prev[stat] + 1;
                updates.rebounds = prev.rebounds + 1; // Also increment total rebounds
            } else {
                // For other stats like assists, steals, blocks, turnovers, fouls
                updates[stat] = prev[stat] + 1;
            }

            // Record shot if applicable
            if (location && (shotValue === 2 || shotValue === 3 || shotValue === 1)) {
                const newShots = [...(prev.shots || [])];
                newShots.push({
                    x: location.x,
                    y: location.y,
                    value: shotValue,
                    isMake,
                    type: `${shotValue}pt`,
                    period: prev.currentPeriod,
                    time: getTimestamp()
                });
                updates.shots = newShots;
            }

            return updates;
        });

        // Close modal if open
        setShowCourtModal(false);
        setPendingShot(null);
    };

    const resetGame = () => {
        if (!confirm("Are you sure you want to reset the current stats?")) return;
        setGameState(INITIAL_GAME_STATE);
        setHistoryStack([]);
    };

    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setTeamLogo(reader.result);
                localStorage.setItem('stat-tracker-logo', reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePeriodChange = (direction) => {
        const maxPeriods = gameDetails.format === 'quarters' ? 4 : 2;
        setGameState(prev => {
            let next = prev.currentPeriod + direction;
            if (next < 1) next = 1;
            if (next > maxPeriods) next = maxPeriods;
            return { ...prev, currentPeriod: next };
        });
    };

    // --- Submission ---

    const initSubmitProcess = () => {
        if (!gameDetails.homeTeam.trim() || !gameDetails.awayTeam.trim()) {
            setPendingSubmit(true);
            alert("⚠️ Please enter Team Names in 'Game Info' first.");
            setShowGameDetails(true);
            return;
        }
        setFinalResult({ outcome: 'Win', homeScore: '', awayScore: '' });
        setShowSubmitModal(true);
        setPendingSubmit(false); // Reset flag if successful
    };

    const confirmSaveGame = async () => {
        if (isSaving) return;
        setIsSaving(true);

        const home = parseInt(finalResult.homeScore) || 0;
        const away = parseInt(finalResult.awayScore) || 0;
        const finalScoreString = `${home} - ${away}`;

        // Generate consistent ID (Client-Side)
        let newId = `local_${Date.now()}`;
        let docRef = null;
        if (user && db) {
            // Create a reference to generate a unique ID
            docRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'games'));
            newId = docRef.id;
        }

        const gameData = {
            ...gameDetails,
            stats: gameState,
            createdAt: new Date().toISOString(),
            finalScore: finalScoreString,
            outcome: finalResult.outcome,
            teamScores: { home, away },
            id: newId // Use the consistent ID
        };

        // 1. Optimistic Local Save
        try {
            const localGames = JSON.parse(localStorage.getItem('stat-tracker-games') || '[]');
            // Deduplicate just in case
            const filteredLocal = localGames.filter(g => g.id !== newId);
            filteredLocal.push(gameData);
            localStorage.setItem('stat-tracker-games', JSON.stringify(filteredLocal));

            // 2. Capture Shot Chart (if enabled)
            let shotChartDataUrl = null;
            if (shotChartingEnabled) {
                const chartElement = document.getElementById('live-shot-chart');
                if (chartElement) {
                    try {
                        const canvas = await html2canvas(chartElement, { useCORS: true, scale: 2 });
                        shotChartDataUrl = canvas.toDataURL('image/png');
                    } catch (e) {
                        console.error("Failed to capture shot chart", e);
                    }
                }
            }

            // 3. Trigger Post-Save UI immediately
            handlePostSave(gameData, finalScoreString); // Pass gameData and finalScoreString

            // 4. Google Sheets Export (Fire & Forget)
            if (googleSheetUrl) {
                const sheetPayload = {
                    date: new Date(gameData.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
                    time: new Date().toLocaleTimeString(),
                    player: playerName,
                    opponent: gameData.awayTeam,
                    outcome: gameData.outcome,
                    score: gameData.finalScore,
                    pts: gameState.points,
                    oreb: gameState.oreb,
                    dreb: gameState.dreb,
                    reb: gameState.rebounds,
                    ast: gameState.assists,
                    stl: gameState.steals,
                    blk: gameState.blocks,
                    to: gameState.turnovers,
                    fouls: gameState.fouls,
                    fgm: gameState.fgm,
                    fga: gameState.fga,
                    pm3: gameState.fg3m,
                    pa3: gameState.fg3a,
                    ftm: gameState.ftm,
                    fta: gameState.fta,
                    shotChartImage: shotChartDataUrl // Send Base64 Image
                };

                // console.log("Payload size:", JSON.stringify(sheetPayload).length);

                fetch(googleSheetUrl, {
                    method: 'POST',
                    mode: 'no-cors', // Important for Google Script Web App
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sheetPayload)
                }).then(() => console.log("Sent to Sheets"))
                    .catch(err => console.error("Sheet Export Failed", err));
            }

            // 5. Background Sync
            if (user && db && docRef) {
                // Use setDoc with the pre-generated ID to prevent duplicates
                setDoc(docRef, {
                    ...gameData,
                    createdAt: serverTimestamp() // Override with server timestamp
                }).then(() => console.log("Synced to Firebase successfully."))
                    .catch(err => console.error("Background sync failed:", err));
            }
        } catch (error) {
            console.error("Critical Save Error:", error);
            alert("❌ Could not save to local storage! Check device space.");
        } finally {
            setIsSaving(false);
        }
    };

    const rainEmojis = (emoji) => {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);

            // Fallback for "emoji" if library doesn't support it: use a DOM approach or scalar
            // Since standard canvas-confetti doesn't support emojis easily without custom shapes,
            // We will use a simple DOM overlay for emojis or just colored confetti if that fails.
            // BUT, a better way for "Crying Emojis" without complex canvas logic is to just append elements.

            // Let's implement a quick DOM falling effect here instead of using canvas-confetti for emojis
        }, 250);

        // Simple DOM Emoji Rain
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '9999';
        container.id = 'emoji-rain-container';
        document.body.appendChild(container);

        const createEmoji = () => {
            const e = document.createElement('div');
            e.innerText = emoji;
            e.style.position = 'absolute';
            e.style.left = Math.random() * 100 + 'vw';
            e.style.top = '-50px';
            e.style.fontSize = Math.random() * 20 + 20 + 'px';
            e.style.opacity = Math.random();
            e.style.transform = `rotate(${Math.random() * 360}deg)`;
            e.style.transition = `top ${Math.random() * 2 + 3}s linear, opacity 3s ease-out`; // 3-5s fall
            container.appendChild(e);

            // Animate
            requestAnimationFrame(() => {
                e.style.top = '110vh';
                e.style.opacity = '0';
            });

            // Cleanup
            setTimeout(() => {
                e.remove();
            }, 5000);
        };

        const rainInterval = setInterval(createEmoji, 100);
        setTimeout(() => {
            clearInterval(rainInterval);
            setTimeout(() => container.remove(), 6000);
        }, 3000); // Stop creating after 3s
    };

    const triggerLossEffect = () => {
        rainEmojis('😭');
    };



    const handlePostSave = (gameData, finalScoreString) => {
        setShowSubmitModal(false);
        if (finalResult.outcome === 'Win') {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: [theme.accent, theme.bg, '#ffffff'] });
        } else if (finalResult.outcome === 'Loss') {
            triggerLossEffect();
        }

        // Clear Active Game Storage
        localStorage.removeItem('stat-tracker-active-game');

        setGameState(INITIAL_GAME_STATE);
        setHistoryStack([]);
        setGameDetails(prev => ({
            ...prev,
            homeTeam: myTeamName,
            awayTeam: '',
            notes: '',
            date: new Date().toISOString().split('T')[0]
        }));
        fetchGames();
    };

    const deleteGame = (gameId) => {
        setGameToDelete(gameId);
    };
    const confirmDelete = async () => {
        if (!gameToDelete) return;
        const gameId = gameToDelete;

        // Optimistic UI update: Close modal immediately
        setGameToDelete(null);

        // Update UI list immediately by filtering local state
        setGames(prev => prev.filter(g => g.id !== gameId));

        // Background operations
        try {
            // Delete from local storage
            const localGames = JSON.parse(localStorage.getItem('stat-tracker-games') || '[]');
            const newLocalGames = localGames.filter(g => g.id !== gameId);
            localStorage.setItem('stat-tracker-games', JSON.stringify(newLocalGames));

            // Delete from Firebase
            if (user && db && !gameId.toString().startsWith('local_')) {
                await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'games', gameId));
            }
        } catch (error) {
            console.error("Error deleting game:", error);
            alert("Note: Could not fully delete game from cloud (check connection).");
        }

        fetchGames(); // Re-sync to be sure
    };

    const generateRecap = (game, playerName, allGames = []) => {
        const safeScore = game.finalScore || "0-0";
        const s = game.stats || {};

        // Calcs
        const calcPct = (m, a) => a > 0 ? Math.round((m / a) * 100) : 0;

        // Shooting
        const fgM = s.fgm || 0; const fgA = s.fga || 0;
        const fg3M = s.fg3m || 0; const fg3A = s.fg3a || 0;
        const ftM = s.ftm || 0; const ftA = s.fta || 0;

        // 2PT makes/attempts (Derived)
        const fg2M = fgM - fg3M;
        const fg2A = fgA - fg3A;

        const fgPct = calcPct(fgM, fgA);
        const fg2Pct = calcPct(fg2M, fg2A);
        const fg3Pct = calcPct(fg3M, fg3A);
        const ftPct = calcPct(ftM, ftA);

        const periodBreakdown = Object.entries(s.periodScores || {}).map(([p, score]) => {
            return `Q${p}: ${score} PTS, 0 REB, 0 AST`;
        }).join('\n');

        // SEASON AGGREGATE CALCULATION
        let seasonSection = "";
        if (allGames && allGames.length > 0) {
            let tFGM = 0, tFGA = 0;
            let t3PM = 0, t3PA = 0;
            let tFTM = 0, tFTA = 0;

            allGames.forEach(g => {
                const gs = g.stats || {};
                tFGM += (gs.fgm || 0); tFGA += (gs.fga || 0);
                t3PM += (gs.fg3m || 0); t3PA += (gs.fg3a || 0);
                tFTM += (gs.ftm || 0); tFTA += (gs.fta || 0);
            });

            seasonSection =
                `🏆 SEASON SNAPSHOT (${allGames.length} Games):\n` +
                `• Overall FG: ${tFGM}/${tFGA} (${calcPct(tFGM, tFGA)}%)\n` +
                `• 3-Point FG: ${t3PM}/${t3PA} (${calcPct(t3PM, t3PA)}%)\n` +
                `• Free Throws: ${tFTM}/${tFTA} (${calcPct(tFTM, tFTA)}%)`;
        }

        // Text Generation
        // Note: The prompt example had "MVA - Varsity Purple vs TNT" twice.
        // And a customized bio paragraph. "Enzo contributed...".
        // Since this is a static share string, I can't generate the dynamic bio text without AI.
        // But the user said "share stats info... here is what it should look like".
        // The requested block has "ENZO PERFORMANCE BREAKDOWN" and "STATISTICAL SUMMARY" sections dynamically.
        // For the "Enzo contributed..." paragraph, I will template a simple one:
        // "[Player] contributed [Points] points in a [Outcome] vs [Opponent]."

        const pName = (playerName || 'Player').toUpperCase();

        return `🏀 Game Recap: ${game.homeTeam} vs ${game.awayTeam}\n` +
            `📅 ${new Date(game.date).toLocaleDateString()}\n` +
            `🏆 Result: ${game.outcome} (${safeScore})\n\n` +
            // `${game.homeTeam} vs ${game.awayTeam}\n` + // Redundant based on user example, but included if they want exact look
            `Final Score: ${safeScore}\n\n` +
            `📊 ${pName} PERFORMANCE BREAKDOWN\n\n` +
            `${playerName || 'The Player'} contributed ${s.points} points in the ${game.outcome === 'Win' ? 'win' : 'loss'} against ${game.awayTeam}.\n\n` +
            `STATISTICAL SUMMARY:\n` +
            `• Points: ${s.points}\n` +
            `• Field Goals: ${fgM}/${fgA} (${fgPct}%)\n` +
            `• 3-Pointers: ${fg3M}/${fg3A}\n` +
            `• Free Throws: ${ftM}/${ftA}\n` +
            `• Rebounds: ${s.rebounds}\n` +
            `• Assists: ${s.assists}\n` +
            `• Steals: ${s.steals}\n` +
            `• Blocks: ${s.blocks}\n` +
            `• Turnovers: ${s.turnovers}\n` +
            `• Fouls: ${s.fouls}\n` +
            `• Minutes: ${parseInt(gameTime / 60) || 32}\n\n` + // We don't track minutes played perfectly, defaulting or using timer
            `SHOOTING BREAKDOWN:\n` +
            `• Overall FG%: ${fgPct}%\n` +
            `• 2-Point FG%: ${fg2Pct}%\n` +
            `• 3-Point FG%: ${fg3Pct}%\n` +
            `• Free Throw%: ${ftPct}%\n\n` +
            `PERIOD-BY-PERIOD BREAKDOWN:\n` +
            `${periodBreakdown}\n\n` +
            `${seasonSection}`;
    };

    const handleInfoShare = async (game) => {
        const text = generateRecap(game, playerName, games);
        console.log("📤 Sharing Recap from History");

        const shareData = {
            title: `Game Recap: ${game.homeTeam} vs ${game.awayTeam}`,
            text: text,
        };

        // Attempt to capture shot chart image
        const courtElement = document.getElementById(`court-capture-${game.id}`);
        if (courtElement) {
            try {
                console.log("📸 Capturing shot chart...");
                const canvas = await html2canvas(courtElement, {
                    backgroundColor: theme.bg, // Capture with theme background
                    logging: false,
                    scale: 2 // High res
                });

                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                const file = new File([blob], 'shot_chart.png', { type: 'image/png' });

                // Check if browser supports file sharing
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    shareData.files = [file];
                    console.log("📎 Attached Shot Chart Image");
                }
            } catch (captureErr) {
                console.warn("Could not capture shot chart:", captureErr);
            }
        }

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                console.error("Share failed (possibly unsupported content type):", err);
                // Fallback: Retry with JUST text if the file caused it
                if (shareData.files) {
                    delete shareData.files;
                    try {
                        await navigator.share(shareData);
                    } catch (e) {
                        navigator.clipboard.writeText(text);
                        alert("Could not share image directly. Text copied!");
                    }
                }
            }
        } else {
            navigator.clipboard.writeText(text);
            alert("Stats copied to clipboard! (Image sharing requires mobile device)");
        }
    };

    const handleExport = () => {
        if (games.length === 0) {
            alert("No games to export.");
            return;
        }

        const headers = ["Date", "Player", "My Team", "Opponent", "Result", "Score", "Points", "Off. Reb", "Def. Reb", "Total Reb", "Assists", "Steals", "Blocks", "Turnovers", "FGM", "FGA", "3PM", "3PA", "FTM", "FTA", "Fouls"];
        const rows = games.map(g => [
            new Date(g.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
            playerName, // Current player name setting at export time, or saved player name if we saved it (we didn't save it in old games, so this is a safe fallback)
            g.homeTeam,
            g.awayTeam,
            g.outcome,
            g.finalScore,
            g.stats?.points ?? 0,
            g.stats?.oreb ?? 0,
            g.stats?.dreb ?? 0,
            g.stats?.rebounds ?? 0,
            g.stats?.assists ?? 0,
            g.stats?.steals ?? 0,
            g.stats?.blocks ?? 0,
            g.stats?.turnovers ?? 0,
            g.stats?.fgm ?? 0,
            g.stats?.fga ?? 0,
            g.stats?.fg3m ?? 0,
            g.stats?.fg3a ?? 0,
            g.stats?.ftm ?? 0,
            g.stats?.fta ?? 0,
            g.stats?.fouls ?? 0
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `stats_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        document.body.removeChild(link);
    };

    const handleDownloadTemplate = () => {
        const headers = ["Date", "Player", "My Team", "Opponent", "Result", "Score", "Points", "Off. Reb", "Def. Reb", "Total Reb", "Assists", "Steals", "Blocks", "Turnovers", "FGM", "FGA", "3PM", "3PA", "FTM", "FTA", "Fouls"];
        const sampleRow = [
            new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
            "Player Name", "My Team", "Opponent Team", "Win", "21-15", "21", "2", "3", "5", "5", "2", "1", "3", "8", "15", "4", "8", "1", "2", "3"
        ];

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + sampleRow.join(",");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "stat_tracker_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n').map(line => line.trim()).filter(line => line);
                if (lines.length < 2) {
                    alert("Invalid CSV format: Not enough lines.");
                    return;
                }

                // Check Headers (Loose check)
                const headers = lines[0].split(',');
                if (!headers[0].includes("Date") || !headers[6].includes("Points")) {
                    alert("Invalid CSV Template. Please use the templated download.");
                    return;
                }

                const newGames = [];
                // Start from index 1 to skip header
                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split(',');
                    if (row.length < headers.length) continue;

                    // Automatically skip the sample row if user kept it
                    if (row[1] === "Player Name" && row[2] === "My Team") continue;

                    // Index Mapping based on fixed header order:
                    // 0: Date, 2: Home, 3: Away, 4: Outcome, 5: Score
                    // 6: PTS, 7: OR, 8: DR, 9: TR, 10: AST, 11: STL, 12: BLK, 13: TO, 14: FGM, 15: FGA, 16: 3PM, 17: 3PA, 18: FTM, 19: FTA, 20: PF

                    const dateStr = row[0];
                    const pts = parseInt(row[6]) || 0;
                    const oreb = parseInt(row[7]) || 0;
                    const dreb = parseInt(row[8]) || 0;

                    const gameObj = {
                        id: 'imported_' + Date.now() + '_' + i,
                        date: new Date(dateStr).toISOString(), // Attempt to parse standard formats
                        homeTeam: row[2],
                        awayTeam: row[3],
                        outcome: row[4],
                        finalScore: row[5],
                        createdAt: new Date(dateStr).getTime(), // For sorting
                        stats: {
                            points: pts,
                            oreb: oreb,
                            dreb: dreb,
                            rebounds: parseInt(row[9]) || (oreb + dreb),
                            assists: parseInt(row[10]) || 0,
                            steals: parseInt(row[11]) || 0,
                            blocks: parseInt(row[12]) || 0,
                            turnovers: parseInt(row[13]) || 0,
                            fgm: parseInt(row[14]) || 0,
                            fga: parseInt(row[15]) || 0,
                            fg3m: parseInt(row[16]) || 0,
                            fg3a: parseInt(row[17]) || 0,
                            ftm: parseInt(row[18]) || 0,
                            fta: parseInt(row[19]) || 0,
                            fouls: parseInt(row[20]) || 0,
                            periodScores: { 1: pts } // Default all points to Q1 since we don't have period breakdown in CSV
                        }
                    };
                    newGames.push(gameObj);
                }

                if (newGames.length > 0) {
                    const updatedGames = [...games, ...newGames];
                    // Sort descending by date
                    updatedGames.sort((a, b) => {
                        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
                    });

                    setGames(updatedGames);
                    localStorage.setItem('stat-tracker-games', JSON.stringify(updatedGames));
                    alert(`Successfully imported ${newGames.length} games!`);
                } else {
                    alert("No valid games found.");
                }

            } catch (err) {
                console.error("Import Error", err);
                alert("Failed to import CSV.");
            }
        };
        reader.readAsText(file);
        // Reset input
        event.target.value = '';
    };

    // --- Render Helpers ---
    const periods = gameDetails.format === 'halves' ? [1, 2] : [1, 2, 3, 4];
    const getPeriodLabel = (p) => gameDetails.format === 'halves' ? `H${p}` : `Q${p}`;

    const fgPct = gameState.fga > 0 ? Math.round((gameState.fgm / gameState.fga) * 100) : 0;
    const fg3Pct = gameState.fg3a > 0 ? Math.round((gameState.fg3m / gameState.fg3a) * 100) : 0;
    const ftPct = gameState.fta > 0 ? Math.round((gameState.ftm / gameState.fta) * 100) : 0;

    return (
        <div
            className="min-h-screen font-sans pb-12 relative transition-colors duration-300"
            style={{ backgroundColor: theme.bg, color: theme.text }}
        >
            <style>{`
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::selection { background-color: ${theme.accent}; color: ${theme.bg}; }
        /* Hide default datalist arrow to ensure perfect centering */
        input::-webkit-calendar-picker-indicator {
            display: none !important;
            opacity: 0;
        }
      `}</style>

            {/* Opponent Datalist (Shared) */}
            <datalist id="opponent-options">
                {savedOpponents.map(opp => <option key={opp} value={opp} />)}
            </datalist>

            {/* Header */}
            <header className="p-4 sticky top-0 z-40 backdrop-blur-md border-b" style={{ backgroundColor: `${theme.bg}cc`, borderColor: theme.border }}>
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        {teamLogo ? (
                            <img src={teamLogo} alt="Logo" className="w-8 h-8 md:w-10 md:h-10 object-contain rounded-full bg-white/10" />
                        ) : (
                            <Activity className="w-6 h-6" style={{ color: theme.accent }} />
                        )}
                        <div className="flex flex-col">
                            <h1 className="text-lg font-bold tracking-tight leading-none">CourtSide <span style={{ color: theme.accent }}>Tracker</span></h1>
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Tracking: <span style={{ color: theme.text }}>{playerName}</span></span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Opponent Input */}
                        <input
                            type="text"
                            list="opponent-options"
                            value={gameDetails.awayTeam}
                            onChange={(e) => setGameDetails({ ...gameDetails, awayTeam: e.target.value })}
                            className="w-40 md:w-48 px-4 py-2 rounded-full text-sm font-bold bg-transparent border-2 text-center uppercase placeholder:text-white/30 focus:outline-none focus:border-white/60 transition-colors"
                            style={{ borderColor: theme.border }}
                            placeholder="OPPONENT"
                        />

                        {/* History */}
                        <button
                            onClick={() => setShowHistory(true)}
                            className="p-2 transition-opacity hover:opacity-80"
                        >
                            <History className="w-6 h-6" />
                        </button>

                        {/* Settings */}
                        <button onClick={() => setShowSettings(true)} className="p-2 transition-opacity hover:opacity-80">
                            <Settings className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-4 space-y-6">

                {/* --- LIVE TRACKING --- */}
                <section className="rounded-2xl shadow-xl overflow-hidden border" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                    {/* Tracker Header */}
                    <div className="p-4 border-b flex flex-wrap gap-2 justify-between items-center bg-black/10" style={{ borderColor: theme.border }}>
                        <h2 className="flex items-center space-x-2 font-bold uppercase tracking-wider text-sm" style={{ color: theme.accent }}>
                            <PlayCircle className="w-4 h-4" />
                            <span>Live Tracking</span>
                        </h2>
                        <div className="flex items-center space-x-2">
                            {/* Timer Display */}
                            {timerSettings.enabled && (
                                <div className={`flex items-center space-x-2 mr-2 rounded-md px-3 py-1 border transition-colors duration-300 ${isTimerRunning ? 'bg-green-600 border-green-500' : 'bg-red-600 border-red-500'}`}>
                                    <span className="font-mono font-bold text-lg text-white">
                                        {formatTime(gameTime)}
                                    </span>
                                    <button
                                        onClick={() => setIsTimerRunning(!isTimerRunning)}
                                        className="p-1 rounded-full text-white hover:bg-white/20"
                                    >
                                        {isTimerRunning ? <span className="block w-2.5 h-2.5 bg-white rounded-sm" /> : <PlayCircle className="w-4 h-4 fill-current" />}
                                    </button>
                                    <button
                                        onClick={() => { setIsTimerRunning(false); setGameTime(timerSettings.periodLength * 60); }}
                                        className="p-1 text-white opacity-70 hover:opacity-100 hover:bg-white/20 rounded"
                                    >
                                        <Undo2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {/* Separator Removed */}

                            <button
                                onClick={handleUndo}
                                disabled={historyStack.length === 0}
                                className="flex items-center space-x-1 px-3 py-1 rounded text-xs font-medium transition-colors border"
                                style={{
                                    backgroundColor: historyStack.length === 0 ? 'transparent' : `${theme.bg}80`,
                                    borderColor: theme.border,
                                    opacity: historyStack.length === 0 ? 0.5 : 1
                                }}
                            >
                                <Undo2 className="w-3 h-3" />
                                <span>Undo</span>
                            </button>

                            {/* Separator Removed */}
                            <button onClick={() => setShowResetConfirm(true)} className="text-xs text-red-400 hover:text-red-300 font-medium px-2">Reset</button>
                        </div>
                    </div>

                    <div className="p-5 space-y-8">
                        {/* Total Points Display (Moved) */}


                        {/* Scoreboard */}
                        <div className="grid grid-cols-5 gap-2 md:gap-4">
                            {periods.map(p => (
                                <PeriodBox
                                    key={p}
                                    label={getPeriodLabel(p)}
                                    score={gameState.periodScores[p]}
                                    isActive={gameState.currentPeriod === p}
                                    onClick={() => setGameState(prev => ({ ...prev, currentPeriod: p }))}
                                    theme={theme}
                                />
                            ))}
                            {/* Total Box */}
                            <div
                                className="flex flex-col items-center justify-center py-2 px-4 rounded-lg border-2 shadow-sm"
                                style={{
                                    borderColor: theme.border,
                                    backgroundColor: 'rgba(0,0,0,0.2)',
                                    color: theme.text
                                }}
                            >
                                <span className="text-xs font-bold uppercase mb-1 opacity-70">Total</span>
                                <span className="text-2xl font-black">{gameState.points}</span>
                            </div>
                        </div>

                        {/* Shot Chart Preview (Mini) */}
                        {shotChartingEnabled && gameState.shots && gameState.shots.length > 0 && (
                            <div id="live-shot-chart" className="mb-6 rounded-lg border p-4 bg-black/20" style={{ borderColor: theme.border }}>
                                <div className="text-xs font-bold uppercase mb-2 ml-1 opacity-70">Shot Chart</div>
                                <div className="max-w-[200px] mx-auto">
                                    <Court shots={gameState.shots} theme={theme} />
                                </div>
                            </div>
                        )}

                        {/* Scoring Actions */}
                        <div className="space-y-2">
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center" style={{ color: theme.secondaryText }}>
                                <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: theme.accent }}></span>
                                Scoring
                            </h3>
                            {/* Stat Controls - Grid Layout */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                {/* Row 1: 2PT */}
                                <ScoreButton label="+2" subLabel="" onClick={() => handleStatClick('fgm', 2, true, 2)} theme={theme} type="positive" />
                                <MissButton text="-2" onClick={() => handleStatClick('fga', 0, false, 2)} />

                                {/* Row 2: 3PT */}
                                <ScoreButton label="+3" subLabel="" onClick={() => handleStatClick('fg3m', 3, true, 3)} theme={theme} type="positive" />
                                <MissButton text="-3" onClick={() => handleStatClick('fg3a', 0, false, 3)} />

                                {/* Row 3: FT */}
                                <ScoreButton label="+1" subLabel="" onClick={() => handleStatClick('ftm', 1, true, 1)} theme={theme} type="positive" />
                                <MissButton text="-1" onClick={() => handleStatClick('fta', 0, false, 1)} />
                            </div>
                        </div>

                        {/* Other Stats */}
                        <div className="space-y-2">
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center" style={{ color: theme.secondaryText }}>
                                <span className="w-2 h-2 rounded-full bg-blue-400 mr-2"></span>
                                Stats
                            </h3>
                            {/* Other Stats - Grid */}
                            <div className="grid grid-cols-4 gap-2">
                                <ActionButton label="OR" onClick={() => handleStatClick('oreb')} theme={theme} type="positive" />
                                <ActionButton label="DR" onClick={() => handleStatClick('dreb')} theme={theme} type="positive" />
                                <ActionButton label="ASST" onClick={() => handleStatClick('assists')} theme={theme} type="positive" />
                                <ActionButton label="STL" onClick={() => handleStatClick('steals')} theme={theme} type="positive" />

                                <ActionButton label="BLK" onClick={() => handleStatClick('blocks')} theme={theme} type="positive" />
                                <ActionButton label="TO" onClick={() => handleStatClick('turnovers')} theme={theme} type="negative" />
                                <ActionButton label="Foul" onClick={() => handleStatClick('fouls')} theme={theme} type="negative" />
                                <ActionButton label="Tech" onClick={() => setShowTechModal(true)} theme={theme} type="negative" />
                            </div>
                        </div>
                    </div>

                    {/* Stats Summary */}
                    <div className="rounded-xl p-4 border" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderColor: theme.border }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-sm uppercase tracking-wide">Current Stats</h3>
                            <div className="text-xs opacity-70"></div>
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                            <StatCard label="PTS" value={gameState.points} subtext={`${gameState.fgm}/${gameState.fga} FG`} theme={theme} />
                            <StatCard label="OR" value={gameState.oreb} theme={theme} />
                            <StatCard label="DR" value={gameState.dreb} theme={theme} />
                            <StatCard label="AST" value={gameState.assists} theme={theme} />
                            <StatCard label="STL" value={gameState.steals} theme={theme} />
                            <StatCard label="BLK" value={gameState.blocks} theme={theme} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            {[{ l: 'FG%', v: fgPct }, { l: '3PT%', v: fg3Pct }, { l: 'FT%', v: ftPct }].map((s, i) => (
                                <div key={i} className="text-center rounded p-1 bg-white/5">
                                    <div className="text-[10px] opacity-60 uppercase">{s.l}</div>
                                    <div className="font-bold" style={{ color: theme.accent }}>{s.v}%</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={initSubmitProcess}
                        style={{ backgroundColor: theme.accent, color: '#1a0b2e' }}
                        className="w-full font-bold py-3 px-6 rounded-lg shadow-lg flex items-center justify-center space-x-2 transition-transform transform active:scale-95 hover:brightness-110"
                    >
                        <Save className="w-5 h-5" />
                        <span>Submit Game Stats</span>
                    </button>

                </section >
            </main >

            {/* --- GAME DETAILS MODAL --- */}
            <GameDetailsModal
                game={selectedGame}
                onClose={() => setSelectedGame(null)}
                theme={theme}
            />

            {/* --- AI RECAP MODAL --- */}
            <AIRecapModal
                game={selectedRecapGame}
                onClose={() => setSelectedRecapGame(null)}
                theme={theme}
                openAIKey={openAIKey}
                playerName={playerName}
            />

            {/* --- SETTINGS MODAL --- */}
            {
                showSettings && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}>
                            <div className="p-4 border-b flex justify-between items-center bg-black/20" style={{ borderColor: theme.border }}>
                                <h2 className="flex items-center space-x-2 font-bold text-lg">
                                    <User className="w-5 h-5" style={{ color: theme.accent }} />
                                    <span>Player Info</span>
                                </h2>
                                <button onClick={() => setShowSettings(false)}><X className="w-5 h-5 opacity-70 hover:opacity-100" /></button>
                            </div>
                            <div className="p-5 space-y-6">

                                <div className="space-y-4">
                                    {/* Tabs Header */}
                                    <div className="flex border-b mb-4 overflow-x-auto" style={{ borderColor: theme.border }}>
                                        {['player', 'team', 'tracker', 'ai', 'opponents'].map(tab => (
                                            <button
                                                key={tab}
                                                onClick={() => setActiveSettingsTab(tab)}
                                                className={`flex-1 py-2 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap min-w-[70px] ${activeSettingsTab === tab ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
                                                style={{
                                                    borderColor: activeSettingsTab === tab ? theme.accent : 'transparent',
                                                    color: activeSettingsTab === tab ? theme.accent : theme.text
                                                }}
                                            >
                                                {tab === 'player' && 'Player'}
                                                {tab === 'team' && 'Team'}
                                                {tab === 'tracker' && 'Tracker'}
                                                {tab === 'ai' && 'AI'}
                                                {tab === 'opponents' && 'Opponents'}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Tab Content */}
                                    <div className="min-h-[300px]">
                                        {/* --- PLAYER INFO TAB --- */}
                                        {activeSettingsTab === 'player' && (
                                            <div className="space-y-4 animate-in fade-in duration-200">
                                                <div>
                                                    <label className="block text-xs uppercase opacity-70 mb-1">Player Name</label>
                                                    <input
                                                        type="text"
                                                        value={playerName}
                                                        onChange={(e) => {
                                                            setPlayerName(e.target.value);
                                                            localStorage.setItem('stat-tracker-player', e.target.value);
                                                        }}
                                                        className="w-full bg-black/20 border rounded-lg p-3 text-white focus:outline-none focus:border-white/50"
                                                        style={{ borderColor: theme.border }}
                                                        placeholder="Your Name"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs uppercase opacity-70 mb-1">My Team Name (Global)</label>
                                                    <input
                                                        type="text"
                                                        value={myTeamName}
                                                        onChange={(e) => {
                                                            setMyTeamName(e.target.value);
                                                            localStorage.setItem('stat-tracker-my-team', e.target.value);
                                                        }}
                                                        className="w-full bg-black/20 border rounded-lg p-3 text-white focus:outline-none focus:border-white/50"
                                                        style={{ borderColor: theme.border }}
                                                        placeholder="e.g. Lakers"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {/* --- TEAM INFO TAB --- */}
                                        {activeSettingsTab === 'team' && (
                                            <div className="space-y-6 animate-in fade-in duration-200">
                                                {/* Logo Upload */}
                                                <div>
                                                    <label className="block text-xs font-bold uppercase mb-2 opacity-70">Team Logo</label>
                                                    <div className="flex items-center space-x-4">
                                                        <div className="w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center overflow-hidden bg-black/20 text-center" style={{ borderColor: theme.border }}>
                                                            {teamLogo ? <img src={teamLogo} alt="Preview" className="w-full h-full object-cover" /> : <Upload className="w-6 h-6 opacity-50" />}
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <button
                                                                onClick={() => fileInputRef.current?.click()}
                                                                className="px-4 py-2 rounded text-xs font-bold border uppercase hover:bg-white/10"
                                                                style={{ borderColor: theme.border }}
                                                            >
                                                                Upload Logo
                                                            </button>
                                                            <span className="text-[10px] opacity-40">Tap to browse...</span>
                                                        </div>
                                                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                                                    </div>
                                                </div>

                                                {/* Color Pickers */}
                                                <div className="space-y-4">
                                                    <p className="text-xs opacity-70 mb-2">Team Colors (Auto-Generates Theme)</p>
                                                    <div className="p-4 rounded-lg bg-black/20 border space-y-4" style={{ borderColor: theme.border }}>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-sm">Primary Color</span>
                                                                <span className="text-xs opacity-50">Backgrounds & Headers</span>
                                                            </div>
                                                            <input type="color" value={teamColors.primary} onChange={(e) => {
                                                                const newColors = { ...teamColors, primary: e.target.value };
                                                                setTeamColors(newColors);
                                                                localStorage.setItem('stat-tracker-colors', JSON.stringify(newColors));
                                                            }} className="h-10 w-14 rounded cursor-pointer border-none bg-transparent" />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-sm">Secondary Color</span>
                                                                <span className="text-xs opacity-50">Buttons & Highlights</span>
                                                            </div>
                                                            <input type="color" value={teamColors.secondary} onChange={(e) => {
                                                                const newColors = { ...teamColors, secondary: e.target.value };
                                                                setTeamColors(newColors);
                                                                localStorage.setItem('stat-tracker-colors', JSON.stringify(newColors));
                                                            }} className="h-10 w-14 rounded cursor-pointer border-none bg-transparent" />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="pt-2 flex justify-end">
                                                    <button onClick={() => {
                                                        const defaultColors = { primary: '#2d1b4e', secondary: '#fbbf24' };
                                                        setTeamColors(defaultColors);
                                                        localStorage.setItem('stat-tracker-colors', JSON.stringify(defaultColors));
                                                        setTeamLogo(null);
                                                        localStorage.removeItem('stat-tracker-logo');
                                                    }} className="text-xs text-red-400 hover:text-red-300 underline">
                                                        Reset Team Info
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* --- TRACKER SETTINGS TAB --- */}
                                        {activeSettingsTab === 'tracker' && (
                                            <div className="space-y-4 animate-in fade-in duration-200">
                                                {/* Format Selector */}
                                                <div className="bg-black/20 p-3 rounded-lg border border-dashed" style={{ borderColor: theme.border }}>
                                                    <label className="block text-xs font-bold uppercase mb-2 opacity-70 flex items-center gap-2">
                                                        <Layout className="w-4 h-4" /> Game Format
                                                    </label>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setGameDetails({ ...gameDetails, format: 'quarters' })}
                                                            className={`flex-1 py-2 text-sm rounded transition-colors border ${gameDetails.format === 'quarters' ? 'font-bold' : 'opacity-50'}`}
                                                            style={{
                                                                backgroundColor: gameDetails.format === 'quarters' ? theme.accent : 'transparent',
                                                                color: gameDetails.format === 'quarters' ? '#1a0b2e' : theme.text,
                                                                borderColor: theme.border
                                                            }}
                                                        >
                                                            4 Quarters
                                                        </button>
                                                        <button
                                                            onClick={() => setGameDetails({ ...gameDetails, format: 'halves' })}
                                                            className={`flex-1 py-2 text-sm rounded transition-colors border ${gameDetails.format === 'halves' ? 'font-bold' : 'opacity-50'}`}
                                                            style={{
                                                                backgroundColor: gameDetails.format === 'halves' ? theme.accent : 'transparent',
                                                                color: gameDetails.format === 'halves' ? '#1a0b2e' : theme.text,
                                                                borderColor: theme.border
                                                            }}
                                                        >
                                                            2 Halves
                                                        </button>
                                                    </div>

                                                    {/* Timer Toggle */}
                                                    <div className="mt-4 pt-3 border-t border-dashed flex items-center justify-between" style={{ borderColor: theme.border }}>
                                                        <label className="text-xs font-bold uppercase opacity-70">Game Timer</label>
                                                        <button
                                                            onClick={() => {
                                                                const newEnabled = !timerSettings.enabled;
                                                                setTimerSettings({ ...timerSettings, enabled: newEnabled });
                                                                if (newEnabled) setGameTime(timerSettings.periodLength * 60);
                                                            }}
                                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${timerSettings.enabled ? 'bg-green-500' : 'bg-gray-600'}`}
                                                        >
                                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition transition-transform ${timerSettings.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>
                                                    {timerSettings.enabled && (
                                                        <div className="mt-2">
                                                            <label className="text-xs opacity-70 mr-2">Minutes per Period:</label>
                                                            <input
                                                                type="number"
                                                                value={timerSettings.periodLength}
                                                                onChange={(e) => {
                                                                    const val = parseInt(e.target.value) || 12;
                                                                    setTimerSettings({ ...timerSettings, periodLength: val });
                                                                    setGameTime(val * 60);
                                                                }}
                                                                className="w-16 bg-black/20 border rounded px-2 py-1 text-sm text-center"
                                                                style={{ borderColor: theme.border }}
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Shot Chart Toggle */}
                                                    <div className="mt-4 pt-3 border-t border-dashed flex items-center justify-between" style={{ borderColor: theme.border }}>
                                                        <label className="text-xs font-bold uppercase opacity-70">Track Shot Locations</label>
                                                        <button
                                                            onClick={() => setShotChartingEnabled(!shotChartingEnabled)}
                                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${shotChartingEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
                                                        >
                                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition transition-transform ${shotChartingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>

                                                    {/* Google Sheets Integration */}
                                                    <div className="mt-4 pt-3 border-t border-dashed" style={{ borderColor: theme.border }}>
                                                        <label className="block text-xs font-bold uppercase mb-2 opacity-70 flex items-center gap-2">
                                                            <Share2 className="w-4 h-4" /> Google Sheet Web App URL
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={googleSheetUrl}
                                                            onChange={(e) => {
                                                                setGoogleSheetUrl(e.target.value);
                                                                localStorage.setItem('stat-tracker-sheet-url', e.target.value);
                                                            }}
                                                            placeholder="https://script.google.com/macros/s/..."
                                                            className="w-full bg-black/20 border rounded px-3 py-2 text-xs font-mono break-all focus:outline-none focus:border-white/50"
                                                            style={{ borderColor: theme.border }}
                                                        />
                                                        <p className="text-[10px] opacity-40 mt-1">Paste your Web App URL here to auto-export on save.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {/* --- AI SETUP TAB --- */}
                                        {activeSettingsTab === 'ai' && (
                                            <div className="space-y-4 animate-in fade-in duration-200">
                                                <div className="bg-black/20 p-4 rounded-lg border border-dashed" style={{ borderColor: theme.border }}>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Sparkles className="w-5 h-5 text-purple-400" />
                                                        <label className="text-xs font-bold uppercase opacity-70">OpenAI API Key</label>
                                                    </div>

                                                    <p className="text-[10px] opacity-60 mb-2 leading-relaxed">
                                                        Enter your OpenAI API Key to enable AI-powered game recaps.
                                                        Your key is stored locally on this device and sent directly to OpenAI.
                                                    </p>

                                                    <div className="relative">
                                                        <input
                                                            type="password"
                                                            value={openAIKey}
                                                            onChange={(e) => {
                                                                setOpenAIKey(e.target.value);
                                                                localStorage.setItem('stat-tracker-openai-key', e.target.value);
                                                            }}
                                                            placeholder="sk-..."
                                                            className="w-full bg-black/40 border rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-purple-400 transtion-colors"
                                                            style={{ borderColor: theme.border }}
                                                        />
                                                    </div>
                                                    <div className="mt-2 text-[10px] opacity-40 italic">
                                                        Note: Usage costs a fraction of a cent per recap.
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {/* --- OPPONENTS TAB --- */}
                                        {activeSettingsTab === 'opponents' && (
                                            <div className="space-y-4 animate-in fade-in duration-200">
                                                <div className="p-4 rounded-lg border bg-black/20" style={{ borderColor: theme.border }}>
                                                    <h3 className="text-xs font-bold uppercase mb-2 opacity-70">Manage Opponents</h3>
                                                    <div className="flex gap-2 mb-4">
                                                        <input
                                                            id="new-opponent-input"
                                                            type="text"
                                                            placeholder="Add Team Name..."
                                                            className="flex-1 bg-black/40 border rounded px-3 py-2 text-sm focus:outline-none"
                                                            style={{ borderColor: theme.border }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    const val = e.currentTarget.value.trim();
                                                                    if (val && !savedOpponents.includes(val)) {
                                                                        const newList = [...savedOpponents, val].sort();
                                                                        setSavedOpponents(newList);
                                                                        localStorage.setItem('stat-tracker-opponents', JSON.stringify(newList));
                                                                        e.currentTarget.value = '';
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const input = document.getElementById('new-opponent-input');
                                                                const val = input.value.trim();
                                                                if (val && !savedOpponents.includes(val)) {
                                                                    const newList = [...savedOpponents, val].sort();
                                                                    setSavedOpponents(newList);
                                                                    localStorage.setItem('stat-tracker-opponents', JSON.stringify(newList));
                                                                    input.value = '';
                                                                }
                                                            }}
                                                            className="px-3 py-2 rounded font-bold text-xs uppercase"
                                                            style={{ backgroundColor: theme.accent, color: '#1a0b2e' }}
                                                        >
                                                            Add
                                                        </button>
                                                    </div>

                                                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                                                        {savedOpponents.length === 0 && <div className="text-xs opacity-40 text-center py-4">No items yet.</div>}
                                                        {savedOpponents.map(opp => (
                                                            <div key={opp} className="flex justify-between items-center p-2 rounded bg-white/5 group">
                                                                <span className="text-sm font-medium">{opp}</span>
                                                                <button
                                                                    onClick={() => {
                                                                        const newList = savedOpponents.filter(o => o !== opp);
                                                                        setSavedOpponents(newList);
                                                                        localStorage.setItem('stat-tracker-opponents', JSON.stringify(newList));
                                                                    }}
                                                                    className="text-red-400 opacity-50 hover:opacity-100 p-1"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {/* --- HELP TAB --- */}
                                        {activeSettingsTab === 'help' && (
                                            <div className="space-y-4 animate-in fade-in duration-200">
                                                <div className="p-5 rounded-lg border bg-black/20 space-y-4" style={{ borderColor: theme.border }}>
                                                    <div className="flex items-center space-x-3 mb-2">
                                                        <div className="p-2 rounded-full bg-white/10">
                                                            <HelpCircle className="w-6 h-6" style={{ color: theme.accent }} />
                                                        </div>
                                                        <h3 className="font-bold text-lg">How to Use</h3>
                                                    </div>

                                                    <div className="space-y-3 text-sm opacity-80">
                                                        <details className="group cursor-pointer">
                                                            <summary className="font-bold hover:text-white transition-colors list-none flex items-center justify-between">
                                                                <span>1. Tracking a Game</span>
                                                                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                                                            </summary>
                                                            <div className="pt-2 pl-2 space-y-1 text-xs leading-relaxed">
                                                                <p>• Use the <strong>+1, +2, +3</strong> buttons to add score.</p>
                                                                <p>• Use <strong>Stats</strong> (REB, AST, STL) to track performance.</p>
                                                                <p>• Enable <strong>Shot Chart</strong> in 'Tracker' settings to tap shot locations.</p>
                                                            </div>
                                                        </details>

                                                        <details className="group cursor-pointer border-t border-white/5 pt-2">
                                                            <summary className="font-bold hover:text-white transition-colors list-none flex items-center justify-between">
                                                                <span>2. Save & Share</span>
                                                                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                                                            </summary>
                                                            <div className="pt-2 pl-2 space-y-1 text-xs leading-relaxed">
                                                                <p>• Click <strong>Save Game</strong> when finished.</p>
                                                                <p>• Go to <strong>History</strong> (Clock Icon) to view past games.</p>
                                                                <p>• Click the <strong>Share Icon</strong> to get a detailed ESPN-style recap.</p>
                                                                <p>• Use the <strong>AI Icon</strong> (Sparkles) to generate a written story (requires API Key).</p>
                                                            </div>
                                                        </details>

                                                        <details className="group cursor-pointer border-t border-white/5 pt-2">
                                                            <summary className="font-bold hover:text-white transition-colors list-none flex items-center justify-between">
                                                                <span>3. Auto-Save Logic</span>
                                                                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                                                            </summary>
                                                            <div className="pt-2 pl-2 space-y-1 text-xs leading-relaxed">
                                                                <p>• Your game is automatically saved to your device.</p>
                                                                <p>• If you refresh or close the app, it will resume exactly where you left off.</p>
                                                                <p>• Data is cleared only when you <strong>Save</strong> or <strong>Reset</strong>.</p>
                                                            </div>
                                                        </details>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <button onClick={() => setShowSettings(false)} className="w-full py-3 rounded-lg font-bold shadow-lg" style={{ backgroundColor: theme.accent, color: '#1a0b2e' }}>
                                            Save Settings
                                        </button>
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[10px] font-mono opacity-30 select-none">v1.0.0-beta.1</span>
                                            <button
                                                onClick={() => setActiveSettingsTab('help')}
                                                className={`p-1 rounded-full transition-colors ${activeSettingsTab === 'help' ? 'bg-white/20' : 'opacity-50 hover:opacity-100 hover:bg-white/10'}`}
                                                title="Help & Instructions"
                                            >
                                                <HelpCircle className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* --- GAME INFO MODAL --- */}
            {
                showGameDetails && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-2xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
                            <div className="p-4 border-b flex justify-between items-center bg-black/20" style={{ borderColor: theme.border }}>
                                <h2 className="font-bold text-lg">Opponent</h2>
                                <button onClick={() => setShowGameDetails(false)}><X className="w-5 h-5 opacity-70 hover:opacity-100" /></button>
                            </div>
                            <div className="p-5 space-y-4">
                                <div>
                                    <input
                                        type="text"
                                        list="opponent-options"
                                        value={gameDetails.awayTeam}
                                        onChange={(e) => setGameDetails({ ...gameDetails, awayTeam: e.target.value })}
                                        className="w-full bg-black/50 border rounded-lg p-3 text-lg font-bold focus:outline-none focus:border-white/50 transition-colors"
                                        style={{ borderColor: theme.border }}
                                        placeholder="e.g. Celtics"
                                    />
                                </div>

                                <button onClick={() => setShowGameDetails(false)} className="w-full py-3 rounded-lg font-bold shadow-lg" style={{ backgroundColor: theme.accent, color: '#1a0b2e' }}>
                                    Done
                                </button>
                            </div>
                        </div>
                    </div >
                )
            }

            {/* --- SUBMIT RESULT MODAL --- */}
            {
                showSubmitModal && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
                        <div className="w-full max-w-sm rounded-2xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" style={{ backgroundColor: theme.bg, borderColor: theme.accent }}>
                            <div className="p-4 border-b bg-black/20 text-center" style={{ borderColor: theme.border }}>
                                <h2 className="font-bold text-xl uppercase tracking-wide">Final Game Result</h2>
                                <p className="text-sm mt-1 opacity-70">{gameDetails.homeTeam} vs {gameDetails.awayTeam}</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Result Display (Auto-calculated) */}
                                <div className="flex gap-4 mb-6">
                                    <button
                                        onClick={() => setFinalResult({ ...finalResult, outcome: 'Win' })}
                                        className={`flex-1 py-2 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${finalResult.outcome === 'Win' ? 'bg-green-600 border-green-500 shadow-md' : 'bg-transparent border-white/10 opacity-50'}`}
                                    >
                                        <CheckCircle2 className="w-6 h-6" />
                                        <span className="text-lg font-black uppercase tracking-widest">Win</span>
                                    </button>
                                    <button
                                        onClick={() => setFinalResult({ ...finalResult, outcome: 'Loss' })}
                                        className={`flex-1 py-2 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${finalResult.outcome === 'Loss' ? 'bg-red-600 border-red-500 shadow-md' : 'bg-transparent border-white/10 opacity-50'}`}
                                    >
                                        <div className="w-6 h-6 rounded-full border-2 border-current" />
                                        <span className="text-lg font-black uppercase tracking-widest">Loss</span>
                                    </button>
                                </div>

                                {/* Score Inputs */}
                                <div className="p-4 rounded-xl border bg-black/20 space-y-4" style={{ borderColor: theme.border }}>
                                    {/* Score Inputs - Equal Size */}
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="flex-1">
                                            <label className="block text-[10px] uppercase opacity-70 mb-1 truncate text-center">{gameDetails.homeTeam}</label>
                                            <input
                                                type="number"
                                                value={finalResult.homeScore}
                                                onChange={(e) => setFinalResult({ ...finalResult, homeScore: e.target.value })}
                                                className="w-full bg-black border-2 rounded-lg p-3 text-center text-2xl font-bold focus:outline-none focus:border-white"
                                                style={{ borderColor: theme.border }}
                                                placeholder="0"
                                            />
                                        </div>
                                        <span className="text-2xl font-bold opacity-30 pt-4">-</span>
                                        <div className="flex-1">
                                            <label className="block text-[10px] uppercase opacity-70 mb-1 truncate text-center">{gameDetails.awayTeam}</label>
                                            <input
                                                type="number"
                                                value={finalResult.awayScore}
                                                onChange={(e) => setFinalResult({ ...finalResult, awayScore: e.target.value })}
                                                className="w-full bg-black border-2 rounded-lg p-3 text-center text-2xl font-bold focus:outline-none focus:border-white"
                                                style={{ borderColor: theme.border }}
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    {/* Notes Field */}
                                    <div className="pt-2 border-t border-dashed" style={{ borderColor: theme.border }}>
                                        <label className="block text-xs mb-2 opacity-70">Post-Game Notes</label>
                                        <textarea
                                            rows="2"
                                            placeholder="Key takeaways..."
                                            value={gameDetails.notes}
                                            onChange={(e) => setGameDetails({ ...gameDetails, notes: e.target.value })}
                                            className="w-full bg-black/40 border rounded-lg py-2 px-3 text-sm focus:ring-1 outline-none resize-none"
                                            style={{ borderColor: theme.border, '--tw-ring-color': theme.accent }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setShowSubmitModal(false)} className="flex-1 bg-transparent border font-bold py-3 rounded-lg hover:bg-white/5" style={{ borderColor: theme.border, color: theme.secondaryText }}>Cancel</button>
                                <button
                                    onClick={confirmSaveGame}
                                    disabled={isSaving}
                                    className={`flex-1 font-bold py-3 rounded-lg shadow-lg hover:brightness-110 flex items-center justify-center gap-2 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    style={{ backgroundColor: theme.accent, color: '#1a0b2e' }}
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <span>Save Game</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* --- HISTORY MODAL --- */}
            {
                showHistory && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
                            <div className="p-4 border-b flex justify-between items-center bg-black/20" style={{ borderColor: theme.border }}>
                                <h2 className="flex items-center space-x-2 font-bold text-lg">
                                    <History className="w-5 h-5" style={{ color: theme.accent }} />
                                    <span>Game History</span>
                                </h2>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={handleExport}
                                        className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                                        title="Export CSV"
                                    >
                                        <Download className="w-5 h-5 text-green-400" />
                                    </button>

                                    <div className="h-6 w-px bg-white/20 mx-1"></div>

                                    <button
                                        onClick={handleDownloadTemplate}
                                        className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                                        title="Download Template"
                                    >
                                        <FileQuestion className="w-5 h-5 text-blue-400" />
                                    </button>

                                    <label className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors cursor-pointer" title="Import CSV">
                                        <Upload className="w-5 h-5 text-yellow-400" />
                                        <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
                                    </label>

                                    <div className="h-6 w-px bg-white/20 mx-1"></div>

                                    <button onClick={() => setShowHistory(false)}><X className="w-5 h-5 opacity-70 hover:opacity-100" /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {loading ? <div className="text-center py-10 opacity-50">Loading...</div> : games.length === 0 ? <div className="text-center py-10 opacity-50">No games recorded.</div> : (
                                    <div className="space-y-4">
                                        {games.map((game) => {
                                            if (!game || typeof game !== 'object') return null;

                                            // Safe Values
                                            const safeDate = typeof game.date === 'string' ? game.date : 'Unknown Date';
                                            const safeOutcome = typeof game.outcome === 'string' ? game.outcome : 'Pending';
                                            const safeHome = typeof game.homeTeam === 'string' ? game.homeTeam : 'Home';
                                            const safeAway = typeof game.awayTeam === 'string' ? game.awayTeam : 'Away';
                                            const safeScore = typeof game.finalScore === 'string' ? game.finalScore : '0-0';
                                            const s = game.stats || {};

                                            return (
                                                <div key={game.id || Math.random()} className="rounded-xl overflow-hidden shadow-md border transition-all hover:border-opacity-100 border-opacity-50" style={{ backgroundColor: theme.card, borderColor: theme.border }}>

                                                    {/* Header */}
                                                    <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center border-b bg-black/10" style={{ borderColor: theme.border }}>
                                                        <div className="mb-2 md:mb-0">
                                                            <div className="flex items-center space-x-2 mb-1">
                                                                <span className="text-xs font-bold uppercase" style={{ color: theme.accent }}>{new Date(safeDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-')}</span>
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${safeOutcome === 'Win' ? 'bg-green-600 text-white' : safeOutcome === 'Loss' ? 'bg-red-600 text-white' : 'bg-gray-600 text-white'}`}>{safeOutcome}</span>
                                                            </div>
                                                            <h3 className="font-bold text-lg md:text-xl">{safeHome} <span className="text-sm opacity-50 font-normal">vs</span> {safeAway}</h3>
                                                            <div className="text-sm opacity-80 mt-1 font-mono">Final Score: {safeScore}</div>
                                                        </div>
                                                        <div className="flex space-x-2">
                                                            <div className="flex items-center space-x-1">
                                                                <button
                                                                    onClick={() => setSelectedGame(game)}
                                                                    className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                                                                    title="View Details"
                                                                >
                                                                    <Eye className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleInfoShare(game)}
                                                                    className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 transition-colors"
                                                                    title="Share Stats"
                                                                >
                                                                    <Share2 className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => setSelectedRecapGame(game)}
                                                                    className="p-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 transition-colors"
                                                                    title="AI Recap"
                                                                >
                                                                    <FileText className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteGame(game.id)}
                                                                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                                                    title="Delete Game"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Stats */}
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-center text-sm">
                                                            <thead>
                                                                <tr className="bg-black/20 text-xs uppercase tracking-wider" style={{ color: theme.secondaryText }}>
                                                                    <th className="py-2 px-2">PTS</th>
                                                                    <th className="py-2 px-2">REB</th>
                                                                    <th className="py-2 px-2">AST</th>
                                                                    <th className="py-2 px-2">STL</th>
                                                                    <th className="py-2 px-2">BLK</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                <tr className="border-t border-white/5">
                                                                    <td className="py-3 px-2 font-bold text-lg">{s.points ?? 0}</td>
                                                                    <td className="py-3 px-2">{s.rebounds ?? 0}</td>
                                                                    <td className="py-3 px-2">{s.assists ?? 0}</td>
                                                                    <td className="py-3 px-2">{s.steals ?? 0}</td>
                                                                    <td className="py-3 px-2">{s.blocks ?? 0}</td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Shot Chart Visualization */}
                                                    {s.shots && s.shots.length > 0 && (
                                                        <div className="mt-4 pt-4 border-t border-white/5">
                                                            <div id={`court-capture-${game.id}`} className="bg-black/40 rounded-lg p-2 max-w-[240px] mx-auto border" style={{ borderColor: theme.border }}>
                                                                <Court shots={s.shots} theme={theme} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {/* --- SHOT CHART MODAL --- */}
            {
                showCourtModal && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
                        <div className="w-full max-w-sm rounded-2xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
                            <div className="p-4 border-b flex justify-between items-center bg-black/20" style={{ borderColor: theme.border }}>
                                <h2 className="font-bold text-lg uppercase tracking-wide">Select Shot Location</h2>
                                <button onClick={() => { setShowCourtModal(false); setPendingShot(null); }}><X className="w-5 h-5 opacity-70 hover:opacity-100" /></button>
                            </div>
                            <div className="p-4">
                                <p className="text-center text-sm opacity-70 mb-4">Tap on the court where the shot was taken.</p>
                                <Court
                                    interactive={true}
                                    theme={theme}
                                    onShot={(loc) => handleStatClick(pendingShot.type === '3pt' ? 'fg3m' : 'fgm', pendingShot.points, pendingShot.isMake, pendingShot.points, loc)}
                                />
                            </div>
                        </div>
                    </div>
                )
            }

            {/* --- TECH FOUL MODAL --- */}
            {
                showTechModal && (
                    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="w-full max-w-sm rounded-xl p-6 border shadow-2xl transform transition-all scale-100" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-2">
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold">Technical Foul Actions</h3>
                                <p className="text-sm opacity-70">Select the outcome of the Technical Foul.</p>

                                <div className="w-full flex flex-col gap-3 pt-2">
                                    <button
                                        onClick={() => { handleStatClick('fouls'); setShowTechModal(false); }}
                                        className="w-full py-3 rounded-lg font-bold border hover:bg-white/5 transition-colors flex items-center justify-center space-x-2"
                                        style={{ borderColor: theme.border }}
                                    >
                                        <span>Tech Foul Committed</span>
                                    </button>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => { handleStatClick('ftm', 1, true, 1); setShowTechModal(false); }}
                                            className="py-3 rounded-lg font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg transition-transform active:scale-95"
                                        >
                                            Tech FT Made
                                        </button>
                                        <button
                                            onClick={() => { handleStatClick('fta', 0, false, 1); setShowTechModal(false); }}
                                            className="py-3 rounded-lg font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg transition-transform active:scale-95"
                                        >
                                            Tech FT Miss
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setShowTechModal(false)}
                                    className="text-sm text-center text-white/50 hover:text-white mt-2"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* --- RESET CONFIRMATION MODAL --- */}
            {
                showResetConfirm && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="w-full max-w-sm rounded-xl p-6 border shadow-2xl transform transition-all scale-100" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 mb-2">
                                    <Undo2 className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold">Reset Game Stats?</h3>
                                <p className="text-sm opacity-70">This will clear all current points and stats. This action cannot be undone.</p>

                                <div className="flex w-full gap-3 pt-2">
                                    <button
                                        onClick={() => setShowResetConfirm(false)}
                                        className="flex-1 py-3 rounded-lg font-bold border hover:bg-white/5 transition-colors"
                                        style={{ borderColor: theme.border }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            // Cleanup Active Game Storage
                                            localStorage.removeItem('stat-tracker-active-game');

                                            setGameState(INITIAL_GAME_STATE);
                                            setHistoryStack([]);

                                            // Reset Timer
                                            setIsTimerRunning(false);
                                            setGameTime(timerSettings.periodLength * 60);

                                            setShowResetConfirm(false);
                                        }}
                                        className="flex-1 py-3 rounded-lg font-bold bg-yellow-600 hover:bg-yellow-700 text-white shadow-lg transition-transform active:scale-95"
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* --- DELETE CONFIRMATION MODAL --- */}
            {
                gameToDelete && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="w-full max-w-sm rounded-xl p-6 border shadow-2xl transform transition-all scale-100" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-2">
                                    <Trash2 className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold">Delete Game?</h3>
                                <p className="text-sm opacity-70">This action cannot be undone. This game will be permanently removed from your history.</p>

                                <div className="flex w-full gap-3 pt-2">
                                    <button
                                        onClick={() => setGameToDelete(null)}
                                        className="flex-1 py-3 rounded-lg font-bold border hover:bg-white/5 transition-colors"
                                        style={{ borderColor: theme.border }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        className="flex-1 py-3 rounded-lg font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg transition-transform active:scale-95"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
