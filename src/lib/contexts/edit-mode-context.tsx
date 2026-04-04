"use client";

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
  toggleEditMode: () => void;
  content: Record<string, string>;
  updateContent: (key: string, value: string) => Promise<void>;
}

const EditModeContext = createContext<EditModeContextType>({
  editMode: false,
  toggleEditMode: () => {},
  content: {},
  updateContent: async () => {},
});

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  const [content, setContent] = useState<Record<string, string>>({});

  // Fetch all content on mount
  useEffect(() => {
    fetch("/api/admin/content")
      .then((r) => r.json())
      .then((data) => setContent(data))
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
      value={{ editMode, toggleEditMode, content, updateContent }}
    >
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}
