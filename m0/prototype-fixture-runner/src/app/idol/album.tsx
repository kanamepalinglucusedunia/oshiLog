import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

/** Preserves old bookmarks while Album now lives inside Idol Detail. */
export default function IdolAlbumCompatibilityRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace({ pathname: '/idol/[id]', params: { id, tab: 'album' } });
  }, [id, router]);

  return null;
}
