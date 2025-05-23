
import type { Metadata } from 'next';
import FingerCounterApp from '@/components/finger-counter-app';

export const metadata: Metadata = {
  title: 'Live AI Finger Counter App',
  description: 'Count fingers in real-time using your camera and AI, with history and calculation features.',
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <FingerCounterApp />
    </main>
  );
}

