
import { BACKEND_URL } from '../config';

type MessageHandler = (data: any) => void;

export interface ChatMessageData {
    type: 'LOBBY' | 'GAME';
    gameId?: string; // Optional, only for game chat
    sender: string;
    text: string;
    timestamp: number;
    id?: string;
    avatar?: string;
}

class SocketService {
    private socket: WebSocket | null = null;
    private handlers: Set<MessageHandler> = new Set();
    private reconnectTimeout: any;
    private isConnecting = false;

    connect() {
        if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) return;
        
        this.isConnecting = true;
        // Convert http(s) to ws(s)
        const wsUrl = BACKEND_URL.replace(/^http/, 'ws');
        
        console.log(`Connecting to WebSocket: ${wsUrl}`);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('✅ WS Connected');
            this.isConnecting = false;
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handlers.forEach(h => h(data));
            } catch (e) { 
                console.error('WS Parse Error', e); 
            }
        };

        this.socket.onclose = () => {
            this.isConnecting = false;
            console.log('WS Closed, reconnecting in 3s...');
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
        };

        this.socket.onerror = (err) => {
            console.error('WS Error', err);
            this.isConnecting = false;
        };
    }

    subscribe(handler: MessageHandler) {
        this.handlers.add(handler);
        // Ensure we are connected when someone subscribes
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.connect();
        }
        return () => this.handlers.delete(handler);
    }

    send(data: ChatMessageData) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        } else {
            console.warn("WS not open, message queued or lost");
            // Optional: Implement a queue here if needed
        }
    }
}

export const socketService = new SocketService();
