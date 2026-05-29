import { useCallback, useEffect, useState } from "react";
import { WardrobeItem } from "../types";
import { getWardrobeList } from "../services/wardrobeService";

export function useWardrobeList(uid?: string): {
  items: WardrobeItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!uid) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await getWardrobeList(uid);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "옷장 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { items, loading, error, refetch };
}
