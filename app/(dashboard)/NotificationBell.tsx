'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import Link from 'next/link';

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  action_url?: string | null;
  lead_id?: string | null;
  campaign_id?: string | null;
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=10');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch {
      console.error('Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount and periodically
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Every minute
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      });
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      console.error('Failed to mark notifications as read');
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: [id] }),
      });
      setNotifications(
        notifications.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch {
      console.error('Failed to mark notification as read');
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getNotificationLink = (n: Notification): string => {
    if (n.action_url) return n.action_url;
    if (n.lead_id) return `/leads/${n.lead_id}`;
    if (n.campaign_id) return `/campaigns/${n.campaign_id}`;
    return '#';
  };

  const typeColors: Record<string, string> = {
    positive_reply: 'bg-green-100 text-green-600',
    reply_received: 'bg-blue-100 text-blue-600',
    bounce: 'bg-orange-100 text-orange-600',
    campaign_completed: 'bg-purple-100 text-purple-600',
    system: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-medium">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={getNotificationLink(n)}
                  onClick={() => {
                    if (!n.is_read) handleMarkRead(n.id);
                    setIsOpen(false);
                  }}
                  className={`block px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 ${
                    !n.is_read ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${
                        !n.is_read ? 'bg-blue-500' : 'bg-transparent'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            typeColors[n.type] || typeColors.system
                          }`}
                        >
                          {n.type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTime(n.created_at)}
                        </span>
                      </div>
                      <p className="text-sm font-medium mt-1 truncate">
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {n.message}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t text-center">
              <Link
                href="/inbox"
                className="text-sm text-blue-600 hover:underline"
                onClick={() => setIsOpen(false)}
              >
                View all in inbox
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
