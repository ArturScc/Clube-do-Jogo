'use client';

import { useParams } from 'next/navigation';
import { useApp } from '@/components/app-provider';
import { ProfileView } from '@/components/profile-view';

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const { user } = useApp();
  return <ProfileView profileId={params.id} own={user?.id === params.id} />;
}
