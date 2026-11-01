import * as vscode from 'vscode';
import type { ChatLogEntry } from './chatLog';

export const DEFAULT_MAX_CHAT_MESSAGES = 100;

export function maxChatMessages(): number {
    const raw = vscode.workspace.getConfiguration('dateSkunder').get<number>('community.maxMessages');
    const value = Math.round(Number(raw));
    if (!Number.isFinite(value) || value < 0) { return DEFAULT_MAX_CHAT_MESSAGES; }
    return value;
}

export function communityMessageCount(entries: Pick<ChatLogEntry, 'room'>[]): number {
    return entries.filter((entry) => entry.room === 'komunitas').length;
}

export function discussionMessageCount(entries: Pick<ChatLogEntry, 'room'>[]): number {
    return entries.filter((entry) => entry.room === 'diskusi').length;
}

/** Apakah catatan sudah mencapai batas dan harus diarsipkan + dibersihkan? */
export function shouldClearChat(
    entries: Pick<ChatLogEntry, 'room'>[],
    limit = maxChatMessages(),
): boolean {
    return limit > 0 && communityMessageCount(entries) >= limit;
}

export function shouldRotateDiscussion(count: number, limit = maxChatMessages()): boolean {
    return limit > 0 && count >= limit;
}
