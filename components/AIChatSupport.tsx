'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, User, Bot, Phone, Mail } from 'lucide-react';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
}

export default function AIChatSupport() {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            text: "Hello! 👋 I'm your JanNivaran AI Assistant. How can I help you with your grievance today?",
            sender: 'bot',
            timestamp: new Date()
        }
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            text: input,
            sender: 'user',
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');

        // Simulate AI processing
        setTimeout(() => {
            const botResponse = generateResponse(userMessage.text);
            setMessages(prev => [...prev, botResponse]);
        }, 1000);
    };

    const generateResponse = (text: string): Message => {
        const lowerText = text.toLowerCase();
        let responseText = '';

        if (lowerText.includes('contact') || lowerText.includes('number') || lowerText.includes('email') || lowerText.includes('call') || lowerText.includes('support')) {
            responseText = "You can reach our support team directly:\n\n📞 Call: 9322088956\n✉️ Email: ogaupale@gmail.com";
        } else if (lowerText.includes('file') || lowerText.includes('new') || lowerText.includes('complain') || lowerText.includes('grievance')) {
            responseText = "To file a new grievance, please click on the 'File Complaint' button on your dashboard or the home page. Make sure to provide clear details and photo evidence if possible.";
        } else if (lowerText.includes('status') || lowerText.includes('track') || lowerText.includes('check')) {
            responseText = "You can track the status of your complaints in the 'My Complaints' section of your dashboard. We provide real-time updates on progress and SLA timelines.";
        } else if (lowerText.includes('delete') || lowerText.includes('remove')) {
            responseText = "Citizens can delete their complaints from the dashboard. Look for the 'Delete' option in the complaint details. Please note this action is permanent.";
        } else if (lowerText.includes('hello') || lowerText.includes('hi')) {
            responseText = "Hello there! How can I assist you with the JanNivaran portal today?";
        } else {
            responseText = "I'm here to help! You can ask me about filing complaints, checking status, or getting support contact details. \n\nFor urgent matters, please contact:\n📞 9322088956\n✉️ ogaupale@gmail.com";
        }

        return {
            id: (Date.now() + 1).toString(),
            text: responseText,
            sender: 'bot',
            timestamp: new Date()
        };
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="bg-white w-80 sm:w-96 rounded-2xl shadow-2xl border border-gray-200 mb-4 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-300 flex flex-col" style={{ height: '500px' }}>
                    {/* Header */}
                    <div className="bg-noble-dark p-4 flex items-center justify-between text-white">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-full">
                                <Bot size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm">JanNivaran Support</h3>
                                <p className="text-xs text-white/80">AI Assistant • Online</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="hover:bg-white/20 p-1 rounded transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${msg.sender === 'user'
                                            ? 'bg-noble-dark text-white rounded-br-none'
                                            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'
                                        }`}
                                >
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-3 bg-white border-t border-gray-100 pb-4">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="Type your message..."
                                className="flex-1 px-4 py-2 bg-gray-100 border-none rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-noble-dark/20"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim()}
                                className="bg-noble-dark text-white p-2 rounded-full hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                        <div className="text-[10px] text-center text-gray-400 mt-2">
                            Need human help? Call 9322088956
                        </div>
                    </div>
                </div>
            )}

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="bg-noble-dark hover:bg-black text-white p-4 rounded-full shadow-lg transition-all transform hover:scale-105 flex items-center gap-2 group"
            >
                {isOpen ? (
                    <X size={24} />
                ) : (
                    <>
                        <MessageCircle size={24} />
                        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 text-sm font-bold whitespace-nowrap">
                            Chat with us
                        </span>
                    </>
                )}
            </button>
        </div>
    );
}
