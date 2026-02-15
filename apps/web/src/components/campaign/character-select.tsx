"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api-client";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

interface CharacterSelectProps {
  campaignId: string;
  onSelect: (characterId: string) => void;
}

export function CharacterSelect({
  campaignId,
  onSelect,
}: CharacterSelectProps) {
  const [characters, setCharacters] = useState<api.Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listCharacters(campaignId)
      .then(setCharacters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaignId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const char = await api.createCharacter(campaignId, newName);
      setCharacters((prev) => [...prev, char]);
      setNewName("");
      setShowCreate(false);
      onSelect(char.id);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-200">
        Select Your Character
      </h3>

      {characters.length === 0 && !showCreate && (
        <p className="text-sm text-gray-400">
          No characters yet. Create one to get started.
        </p>
      )}

      <div className="grid gap-3">
        {characters.map((char) => (
          <button
            key={char.id}
            onClick={() => onSelect(char.id)}
            className="w-full rounded-lg border border-surface-600 bg-surface-700 px-4 py-3 text-left transition-colors hover:border-gold-500/40"
          >
            <span className="font-medium text-gray-100">{char.name}</span>
          </button>
        ))}
      </div>

      {showCreate ? (
        <Card>
          <CardHeader>
            <h4 className="text-sm font-semibold text-gray-200">
              New Character
            </h4>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex gap-2">
              <Input
                placeholder="Character name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="flex-1"
              />
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? "..." : "Create"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowCreate(true)}
        >
          + New Character
        </Button>
      )}
    </div>
  );
}
