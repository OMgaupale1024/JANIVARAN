'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot } from 'lucide-react';

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
            text: "Hello! 👋 I'm JanNivaran AI. \n\nI can help you file complaints, understand department categories, or track status. What issue are you facing today?",
            sender: 'bot',
            timestamp: new Date()
        }
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const nextId = useRef(2);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: Message = {
            id: String(nextId.current++),
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

        // 1. Complaint Classification Logic
        if (lowerText.includes('water') || lowerText.includes('leak') || lowerText.includes('pipe') || lowerText.includes('supply')) {
            responseText = "For water-related issues like leakage, low pressure, or no supply, this falls under the **Water Department**. \n\nPlease file a complaint with your location and a photo if possible. We will route it immediately.";
        }
        else if (lowerText.includes('electricity') || lowerText.includes('power') || lowerText.includes('light') || lowerText.includes('meter') || lowerText.includes('current')) {
            responseText = "This sounds like an issue for the **Electricity Department**. \n\nWhether it's a power cut, faulty meter, or street light issue, please submit a complaint so we can track it against the SLA.";
        }
        else if (lowerText.includes('road') || lowerText.includes('pothole') || lowerText.includes('traffic') || lowerText.includes('signal') || lowerText.includes('transport')) {
            responseText = "Potholes, broken roads, and traffic signal issues belong to **Road & Transport**. \n\nPlease help us by providing the exact location/landmark when you file the complaint.";
        }
        else if (lowerText.includes('garbage') || lowerText.includes('trash') || lowerText.includes('drain') || lowerText.includes('clean') || lowerText.includes('sanitation') || lowerText.includes('waste')) {
            responseText = "Based on your description, this should be directed to **Sanitation & Waste Management**. \n\nCleanliness is a priority. Please upload a photo of the area to speed up the process.";
        }
        else if (lowerText.includes('safety') || lowerText.includes('unsafe') || lowerText.includes('dark') || lowerText.includes('manhole')) {
            responseText = "Safety is paramount. This belongs to **Public Safety**. \n\nPlease file this immediately. If it's an emergency, please also contact local emergency services.";
        }
        else if (lowerText.includes('hospital') || lowerText.includes('ambulance') || lowerText.includes('health') || lowerText.includes('doctor')) {
            responseText = "For government hospital or ambulance delays, this goes to **Health Services**. \n\nWe treat these with high priority.";
        }

        // 2. Status & SLA Queries
        else if (lowerText.includes('status') || lowerText.includes('track') || lowerText.includes('where')) {
            responseText = "You can track your complaint status in real-time on your dashboard, just like an order delivery 🚚.\n\n**Statuses:**\n• **Submitted**: Received\n• **Assigned**: With an official\n• **In Progress**: Work started\n• **Resolved**: Fixed";
        }
        else if (lowerText.includes('sla') || lowerText.includes('time') || lowerText.includes('long') || lowerText.includes('delay')) {
            responseText = "**SLA (Service Level Agreement)** is the promised time limit for resolution. \n\nIf the time is crossed, the complaint is automatically **Escalated** to senior authorities for deeper review.";
        }

        // 3. Filing Guidance
        else if (lowerText.includes('file') || lowerText.includes('new') || lowerText.includes('create') || lowerText.includes('submit')) {
            responseText = "To file a complaint:\n1. Click **+ File Complaint**\n2. Describe the issue\n3. Select the location\n4. Upload a photo (optional but helpful)\n\nWe will automatically route it to the correct department for you.";
        }

        // 4. Contact & Escalation
        else if (lowerText.includes('contact') || lowerText.includes('call') || lowerText.includes('phone') || lowerText.includes('email') || lowerText.includes('talk') || lowerText.includes('support')) {
            responseText = "You can notify the authority directly if needed.\n\n📞 **Support**: 9322088956\n✉️ **Email**: ogaupale@gmail.com\n\nIf your complaint is stalled, you can also use the 'Escalate' button on the dashboard.";
        }

        // 5. General Greeting / Unclear
        else {
            responseText = "Hello! I am **JanNivaran AI**. \n\nI can help you categorize your complaint, explain the process, or guide you to the right department.\n\nBriefly describe your issue (e.g., 'No water', 'Pothole in Andheri') and I'll help you get started.";
        }

        return {
            id: String(nextId.current++),
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
