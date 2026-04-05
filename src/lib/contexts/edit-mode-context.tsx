"use client";

import { hasAdminCookie } from "@/lib/admin-auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface EditModeContextType {
  editMode: boolean;
  isAdmin: boolean;
  toggleEditMode: () => void;
  content: Record<string, string>;
  updateContent: (key: string, value: string) => Promise<void>;
}

const EditModeContext = createContext<EditModeContextType>({
  editMode: false,
  isAdmin: false,
  toggleEditMode: () => {},
  content: {},
  updateContent: async () => {},
});

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [content, setContent] = useState<Record<string, string>>({});

  // Check admin cookie on mount
  useEffect(() => {
    const admin = hasAdminCookie();
    setIsAdmin(admin);
    if (admin) {
      setEditMode(true);
    }
  }, []);

  // Fetch all content on mount
  useEffect(() => {
    fetch("/api/admin/content")
      .then((r) => r.json())
      .then((data) => {
        // API returns { content, grouped } — we only need the flat content map
        if (data && typeof data === "object" && data.content) {
          setContent(data.content);
        } else if (data && typeof data === "object" && !data.content) {
          // Fallback: if API returns flat map directly
          setContent(data);
        }
      })
      .catch(() => {});
  }, []);

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev);
  }, []);

  const updateContent = useCallback(
    async (key: string, value: string) => {
      // Optimistic update
      setContent((prev) => ({ ...prev, [key]: value }));

      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });

      if (!res.ok) {
        // Revert on failure
        setContent((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        throw new Error("Failed to save content");
      }
    },
    [],
  );

  return (
    <EditModeContext.Provider
      value={{ editMode, isAdmin, toggleEditMode, content, updateContent }}
    >
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}
