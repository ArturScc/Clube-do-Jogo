'use client';

import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react';
import { CornerDownRight, MessageCircle, Send, SmilePlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoComments, demoProfiles } from '@/lib/demo-data';
import type { ClubComment, CommentReaction, Game, Profile } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from './app-provider';
import { Avatar } from './ui/avatar';
import { Skeleton } from './ui/skeleton';

type RawComment = Omit<ClubComment, 'profile' | 'reactions' | 'replies'> & { profiles: Profile | Profile[] };
type RawReaction = { comment_id: string; emoji: string; user_id: string; profiles: Profile | Profile[] };

function relationProfile(value: Profile | Profile[] | null | undefined, userId: string): Profile {
  const profile = Array.isArray(value) ? value[0] : value;
  return profile || { id: userId, name: 'Membro', avatar_url: null };
}

export function Timeline({ game }: { game: Game }) {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, isDemo, selectedMonth, isHistorical } = useApp();
  const [body, setBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [reactionNotice, setReactionNotice] = useState('');
  const [commentsParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });

  const query = useStaleQuery<ClubComment[]>(`comments:${game.id}:${selectedMonth}`, async () => {
    if (isDemo) return demoComments.map(comment => ({ ...comment, club_month: selectedMonth }));
    const [{ data: comments, error: commentsError }, { data: reactions, error: reactionsError }] = await Promise.all([
      supabase.from('club_comments').select('*, profiles:user_id (id, name, avatar_url)').eq('game_id', game.id).eq('club_month', selectedMonth).order('created_at'),
      supabase.from('comment_reactions').select('comment_id, emoji, user_id, profiles:user_id (id, name, avatar_url)').eq('game_id', game.id).eq('club_month', selectedMonth),
    ]);
    if (commentsError) throw commentsError;
    if (reactionsError) throw reactionsError;
    const reactionMap = new Map<string, Map<string, Profile[]>>();
    ((reactions || []) as unknown as RawReaction[]).forEach(reaction => {
      if (!reactionMap.has(reaction.comment_id)) reactionMap.set(reaction.comment_id, new Map());
      const byEmoji = reactionMap.get(reaction.comment_id)!;
      const people = byEmoji.get(reaction.emoji) || [];
      people.push(relationProfile(reaction.profiles, reaction.user_id));
      byEmoji.set(reaction.emoji, people);
    });
    const mapped = ((comments || []) as unknown as RawComment[]).map((comment): ClubComment => ({
      ...comment,
      profile: relationProfile(comment.profiles, comment.user_id),
      reactions: Array.from(reactionMap.get(comment.id)?.entries() || []).map(([emoji, users]): CommentReaction => ({ emoji, users, reactedByMe: users.some(person => person.id === user!.id) })),
      replies: [],
    }));
    const roots = mapped.filter(comment => !comment.parent_id);
    mapped.filter(comment => comment.parent_id).forEach(reply => {
      const direct = mapped.find(comment => comment.id === reply.parent_id);
      const root = direct?.parent_id ? roots.find(comment => comment.id === direct.parent_id) : roots.find(comment => comment.id === reply.parent_id);
      root?.replies.push(reply);
    });
    return roots;
  });
  const comments = query.data || [];

  async function post(parentId: string | null) {
    const text = (parentId ? replyBody : body).trim();
    if (!text || isHistorical) return;
    setSending(true);
    const now = new Date().toISOString();
    if (isDemo) {
      const next: ClubComment = { id: crypto.randomUUID(), user_id: user!.id, game_id: game.id, club_month: selectedMonth, parent_id: parentId, body: text, created_at: now, updated_at: now, profile: profile || demoProfiles[0], reactions: [], replies: [] };
      query.setData(parentId ? comments.map(comment => comment.id === parentId ? { ...comment, replies: [...comment.replies, next] } : comment) : [...comments, next]);
    } else {
      await supabase.from('club_comments').insert({ user_id: user!.id, game_id: game.id, club_month: selectedMonth, parent_id: parentId, body: text });
      await query.refresh();
    }
    setBody('');
    setReplyBody('');
    setReplyingTo(null);
    setSending(false);
  }

  async function toggleReaction(comment: ClubComment, emoji: string, rootId: string) {
    const reaction = comment.reactions.find(item => item.emoji === emoji);
    if (!reaction && comment.reactions.length >= 10) {
      setReactionNotice('Limite de 10 emojis diferentes atingido neste comentário.');
      return;
    }
    setReactionNotice('');
    const nextReaction: CommentReaction = reaction ? {
      ...reaction,
      reactedByMe: !reaction.reactedByMe,
      users: reaction.reactedByMe ? reaction.users.filter(person => person.id !== user!.id) : [...reaction.users, profile || demoProfiles[0]],
    } : { emoji, reactedByMe: true, users: [profile || demoProfiles[0]] };
    const updateComment = (item: ClubComment) => item.id === comment.id ? { ...item, reactions: reaction ? item.reactions.map(value => value.emoji === emoji ? nextReaction : value).filter(value => value.users.length) : [...item.reactions, nextReaction] } : item;
    query.setData(comments.map(root => root.id === rootId ? (root.id === comment.id ? updateComment(root) : { ...root, replies: root.replies.map(updateComment) }) : root));
    if (!isDemo) {
      if (reaction?.reactedByMe) await supabase.from('comment_reactions').delete().eq('comment_id', comment.id).eq('user_id', user!.id).eq('emoji', emoji);
      else await supabase.from('comment_reactions').insert({ comment_id: comment.id, user_id: user!.id, emoji, game_id: game.id, club_month: selectedMonth });
    }
  }

  function ReactionPicker({ comment, rootId }: { comment: ClubComment; rootId: string }) {
    return (
      <Popover.Root>
        <Popover.Trigger aria-label="Adicionar reação" className="grid size-7 place-items-center rounded-full text-zinc-600 transition hover:bg-white/5 hover:text-zinc-300"><SmilePlus className="size-3.5" /></Popover.Trigger>
        <Popover.Portal><Popover.Content side="top" align="start" sideOffset={8} className="animated-popup z-[90] overflow-hidden rounded-2xl border border-white/10 shadow-2xl"><EmojiPicker theme={Theme.DARK} emojiStyle={EmojiStyle.NATIVE} width={Math.min(340, typeof window === 'undefined' ? 320 : window.innerWidth - 24)} height={380} previewConfig={{ showPreview: false }} searchPlaceHolder="Buscar emoji" onEmojiClick={(data: EmojiClickData) => void toggleReaction(comment, data.emoji, rootId)} /></Popover.Content></Popover.Portal>
      </Popover.Root>
    );
  }

  function Comment({ comment, rootId, nested = false }: { comment: ClubComment; rootId: string; nested?: boolean }) {
    return (
      <article className={nested ? 'relative flex gap-2.5 py-3 before:absolute before:-left-4 before:top-0 before:h-full before:w-px before:bg-white/8' : 'rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4'}>
        <Avatar src={comment.profile?.avatar_url} name={comment.profile?.name} className={nested ? 'size-8' : 'size-9'} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="truncate text-xs font-extrabold text-zinc-200">{comment.profile?.name || 'Membro'}</span><time className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.045] px-2 py-1 text-[10px] font-semibold text-zinc-400">{formatDateTime(comment.created_at)}</time></div>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">{comment.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {comment.reactions.map(reaction => <button key={reaction.emoji} onClick={() => void toggleReaction(comment, reaction.emoji, rootId)} title={reaction.users.map(person => person.name).join(', ')} className={`inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs transition active:scale-95 ${reaction.reactedByMe ? 'border-violet-400/35 bg-violet-500/15 text-violet-200' : 'border-white/8 bg-white/[0.035] text-zinc-400'}`}><span>{reaction.emoji}</span><span className="text-[10px] font-bold">{reaction.users.length}</span></button>)}
            {!isHistorical && <ReactionPicker comment={comment} rootId={rootId} />}
            {!nested && !isHistorical && <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)} className="ml-1 inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-bold text-zinc-500 hover:bg-white/5 hover:text-zinc-300"><CornerDownRight className="size-3" />Responder</button>}
          </div>
        </div>
      </article>
    );
  }

  return (
    <div ref={commentsParent} className="space-y-4">
      {!isHistorical && <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3"><div className="flex items-start gap-3"><Avatar src={profile?.avatar_url} name={profile?.name} className="size-9" /><textarea value={body} onChange={event => setBody(event.target.value)} rows={2} placeholder="O que você está achando do jogo?" className="min-h-16 min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-zinc-600" /></div><div className="mt-2 flex justify-end"><button disabled={!body.trim() || sending} onClick={() => void post(null)} className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl bg-violet-600 px-4 text-xs font-bold transition active:scale-95 disabled:bg-zinc-800 disabled:text-zinc-600"><Send className="size-3.5" />Comentar</button></div></div>}
      {reactionNotice && <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{reactionNotice}</div>}
      {query.isInitialLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32 w-full" />)}</div> : comments.length === 0 ? <div className="grid min-h-56 place-items-center rounded-3xl border border-dashed border-white/10 p-8 text-center"><div><MessageCircle className="mx-auto size-8 text-zinc-700" /><h3 className="mt-3 text-sm font-bold text-zinc-300">A conversa ainda não começou</h3><p className="mt-1 text-xs text-zinc-500">Compartilhe a primeira impressão sobre o jogo.</p></div></div> : comments.map(comment => (
        <div key={comment.id}>
          <Comment comment={comment} rootId={comment.id} />
          {(comment.replies.length > 0 || replyingTo === comment.id) && <div className="ml-9 pl-4 sm:ml-12">{comment.replies.map(reply => <Comment key={reply.id} comment={reply} rootId={comment.id} nested />)}
            {replyingTo === comment.id && <div className="mt-2 flex items-center gap-2"><input autoFocus value={replyBody} onChange={event => setReplyBody(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void post(comment.id); }} placeholder={`Responder a ${comment.profile?.name || 'membro'}…`} className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs outline-none focus:border-violet-500" /><button aria-label="Enviar resposta" disabled={!replyBody.trim()} onClick={() => void post(comment.id)} className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-600 disabled:bg-zinc-800"><Send className="size-3.5" /></button></div>}
          </div>}
        </div>
      ))}
    </div>
  );
}
