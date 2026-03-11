import React, { useState, useEffect } from 'react';
import { LiquidCard, LiquidButton } from './LiquidUI';
import { getAllUsers, updateUserBalance, banUser, getAllActiveGames, deleteGame, deleteTournament, subscribeToTournaments, createTournament } from '../services/firebase';
import { UserData, OnlineGame, Tournament } from '../types';
import { Trash2, Ban, RefreshCw, Shield, X, User, Trophy, Activity, Plus } from 'lucide-react';

export const AdminPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [activeTab, setActiveTab] = useState<'users' | 'games' | 'tournaments'>('users');
    
    // Data
    const [users, setUsers] = useState<UserData[]>([]);
    const [games, setGames] = useState<OnlineGame[]>([]);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(false);

    // Tournament Creation
    const [isCreateTournamentOpen, setIsCreateTournamentOpen] = useState(false);
    const [newTournamentName, setNewTournamentName] = useState('');
    const [newTournamentTime, setNewTournamentTime] = useState(600);

    // Actions
    const handleLogin = () => {
        if (password === 'admin123') setIsAuthenticated(true);
        else alert('Invalid Password');
    };

    const loadData = async () => {
        setLoading(true);
        if (activeTab === 'users') {
            const u = await getAllUsers(100);
            setUsers(u);
        } else if (activeTab === 'games') {
            const g = await getAllActiveGames();
            setGames(g);
        }
        setLoading(false);
    };

    const handleCreateTournament = async () => {
        if (!newTournamentName) return;
        await createTournament(newTournamentName, newTournamentTime, 'Admin');
        setIsCreateTournamentOpen(false);
        setNewTournamentName('');
        // Subscription will update the list
    };

    useEffect(() => {
        if (isAuthenticated) loadData();
    }, [isAuthenticated, activeTab]);

    // Tournament subscription
    useEffect(() => {
        if (isAuthenticated && activeTab === 'tournaments') {
            const unsub = subscribeToTournaments((data) => setTournaments(data));
            return () => unsub();
        }
    }, [isAuthenticated, activeTab]);

    if (!isAuthenticated) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                <LiquidCard className="w-full max-w-md p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold flex items-center gap-2"><Shield className="w-5 h-5" /> Admin Access</h2>
                        <button onClick={onClose}><X className="w-5 h-5" /></button>
                    </div>
                    <input 
                        type="password" 
                        placeholder="Enter Admin Password" 
                        className="w-full p-2 border rounded bg-background"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                    <LiquidButton onClick={handleLogin} className="w-full">Login</LiquidButton>
                </LiquidCard>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
            <LiquidCard className="w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-muted/20">
                    <div className="flex items-center gap-2">
                        <Shield className="w-6 h-6 text-primary" />
                        <h1 className="text-xl font-bold">Admin Panel</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <LiquidButton variant="secondary" onClick={loadData} disabled={loading}>
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </LiquidButton>
                        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="p-4 border-b bg-muted/10 flex gap-2">
                    <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<User size={16}/>} label="Users" />
                    <TabButton active={activeTab === 'games'} onClick={() => setActiveTab('games')} icon={<Activity size={16}/>} label="Active Games" />
                    <TabButton active={activeTab === 'tournaments'} onClick={() => setActiveTab('tournaments')} icon={<Trophy size={16}/>} label="Tournaments" />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    {activeTab === 'users' && <UsersTable users={users} refresh={loadData} />}
                    {activeTab === 'games' && <GamesTable games={games} refresh={loadData} />}
                    {activeTab === 'tournaments' && (
                        <div className="flex flex-col h-full gap-4">
                            <div className="flex justify-end">
                                <LiquidButton onClick={() => setIsCreateTournamentOpen(true)} className="flex items-center gap-2">
                                    <Plus size={16} /> Create Tournament
                                </LiquidButton>
                            </div>
                            <TournamentsTable tournaments={tournaments} refresh={loadData} />
                        </div>
                    )}
                </div>

                {/* Modals */}
                {isCreateTournamentOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                        <LiquidCard className="w-full max-w-md p-6 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-lg">Create Tournament</h3>
                                <button onClick={() => setIsCreateTournamentOpen(false)}><X size={20}/></button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Tournament Name</label>
                                    <input 
                                        placeholder="e.g. Weekly Blitz" 
                                        className="w-full p-2 border rounded bg-background"
                                        value={newTournamentName}
                                        onChange={e => setNewTournamentName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Time Control</label>
                                    <select 
                                        className="w-full p-2 border rounded bg-background"
                                        value={newTournamentTime}
                                        onChange={e => setNewTournamentTime(Number(e.target.value))}
                                    >
                                        <option value={60}>1 min (Bullet)</option>
                                        <option value={180}>3 min (Blitz)</option>
                                        <option value={300}>5 min (Blitz)</option>
                                        <option value={600}>10 min (Rapid)</option>
                                        <option value={900}>15 min (Rapid)</option>
                                    </select>
                                </div>
                                <LiquidButton onClick={handleCreateTournament} className="w-full" disabled={!newTournamentName}>Create</LiquidButton>
                            </div>
                        </LiquidCard>
                    </div>
                )}
            </LiquidCard>
        </div>
    );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
    <button 
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
    >
        {icon} {label}
    </button>
);

const UsersTable = ({ users, refresh }: { users: UserData[], refresh: () => void }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [balance, setBalance] = useState(0);

    const handleUpdateBalance = async (userId: string) => {
        await updateUserBalance(userId, balance);
        setEditingId(null);
        refresh();
    };

    const handleBan = async (userId: string, currentStatus: boolean) => {
        if (confirm(`Are you sure you want to ${currentStatus ? 'unban' : 'ban'} this user?`)) {
            await banUser(userId, !currentStatus);
            refresh();
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50">
                    <tr>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Rating</th>
                        <th className="px-4 py-3">Balance</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.id} className="border-b hover:bg-muted/20">
                            <td className="px-4 py-3 font-medium flex items-center gap-2">
                                {user.photoUrl && <img src={user.photoUrl} className="w-6 h-6 rounded-full" />}
                                {user.username || 'Unknown'}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs opacity-70">{user.id}</td>
                            <td className="px-4 py-3">{user.rating || 1200}</td>
                            <td className="px-4 py-3">
                                {editingId === user.id ? (
                                    <div className="flex items-center gap-1">
                                        <input 
                                            type="number" 
                                            className="w-20 p-1 border rounded bg-background" 
                                            value={balance} 
                                            onChange={e => setBalance(Number(e.target.value))}
                                        />
                                        <button onClick={() => handleUpdateBalance(user.id!)} className="text-green-500 text-xs">Save</button>
                                    </div>
                                ) : (
                                    <span onClick={() => { setEditingId(user.id!); setBalance(user.balance || 0); }} className="cursor-pointer hover:underline decoration-dashed underline-offset-4">
                                        {user.balance || 0} ETH
                                    </span>
                                )}
                            </td>
                            <td className="px-4 py-3">
                                {user.isBanned ? <span className="text-red-500 font-bold">BANNED</span> : <span className="text-green-500">Active</span>}
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                                <button onClick={() => handleBan(user.id!, !!user.isBanned)} className="p-1 hover:bg-red-100 text-red-500 rounded" title="Ban/Unban">
                                    <Ban size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const GamesTable = ({ games, refresh }: { games: OnlineGame[], refresh: () => void }) => {
    const handleDelete = async (gameId: string) => {
        if (confirm('Delete this game?')) {
            await deleteGame(gameId);
            refresh();
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50">
                    <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">White</th>
                        <th className="px-4 py-3">Black</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {games.map(game => (
                        <tr key={game.id} className="border-b hover:bg-muted/20">
                            <td className="px-4 py-3 font-mono text-xs">{game.id}</td>
                            <td className="px-4 py-3">{game.whitePlayer}</td>
                            <td className="px-4 py-3">{game.blackPlayer}</td>
                            <td className="px-4 py-3">{game.status}</td>
                            <td className="px-4 py-3">
                                <button onClick={() => handleDelete(game.id)} className="p-1 hover:bg-red-100 text-red-500 rounded">
                                    <Trash2 size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const TournamentsTable = ({ tournaments, refresh }: { tournaments: Tournament[], refresh: () => void }) => {
    const handleDelete = async (tId: string) => {
        if (confirm('Delete this tournament?')) {
            await deleteTournament(tId);
            refresh();
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50">
                    <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Host</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Participants</th>
                        <th className="px-4 py-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {tournaments.map(t => (
                        <tr key={t.id} className="border-b hover:bg-muted/20">
                            <td className="px-4 py-3 font-medium">{t.name}</td>
                            <td className="px-4 py-3">{t.host}</td>
                            <td className="px-4 py-3">{t.status}</td>
                            <td className="px-4 py-3">{t.participants ? Object.keys(t.participants).length : 0}</td>
                            <td className="px-4 py-3">
                                <button onClick={() => handleDelete(t.id)} className="p-1 hover:bg-red-100 text-red-500 rounded">
                                    <Trash2 size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
