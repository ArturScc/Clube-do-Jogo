'use client';

import { useApp } from '@/components/app-provider';
import { ProfileView } from '@/components/profile-view';

export default function MyProfilePage() {
  const { user } = useApp();
  return user ? <ProfileView profileId={user.id} own /> : null;
}
