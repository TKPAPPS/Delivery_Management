'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import CreateCardModal from '@/components/board/CreateCardModal';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NewCardButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" /> New Card
      </Button>
      <CreateCardModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => { setOpen(false); router.refresh(); }}
      />
    </>
  );
}
