import { Award, Compass, HeartHandshake, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import type { Profile } from '../types';

export function getProfileBadges(profile: Profile) {
  return [
    { name: '첫 발걸음', description: '첫 번째 물품 등록', icon: Compass, unlocked: profile.registeredCount >= 1, color: 'blue' },
    { name: '따뜻한 연결', description: '물품 1개 반환 완료', icon: HeartHandshake, unlocked: profile.returnedCount >= 1, color: 'green' },
    { name: '동네 탐정', description: '물품 3개 반환 완료', icon: ShieldCheck, unlocked: profile.returnedCount >= 3, color: 'purple' },
    { name: '친절 수집가', description: '누적 350 XP 달성', icon: Award, unlocked: profile.xp >= 350, color: 'orange' },
    { name: '든든한 이웃', description: '물품 5개 반환 완료', icon: Trophy, unlocked: profile.returnedCount >= 5, color: 'gold' },
    { name: '전국의 수호자', description: '누적 1,000 XP 달성', icon: Sparkles, unlocked: profile.xp >= 1000, color: 'navy' },
  ];
}
