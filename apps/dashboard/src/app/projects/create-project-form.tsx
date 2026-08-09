"use client";

import { useState } from "react";
import { createProjectAction } from "@/lib/key-actions";
import { useRouter } from "next/navigation";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function CreateProjectForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await createProjectAction({ name, slug });
    if (result.success) {
      router.push(`/projects/${result.projectId}/keys`);
      router.refresh();
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          style={{
            color: "#f87171",
            marginBottom: "0.75rem",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}
      <label htmlFor="name">Project name</label>
      <input
        id="name"
        value={name}
        onChange={(e) => {
          const next = e.target.value;
          setName(next);
          if (!slugTouched) setSlug(slugify(next));
        }}
        placeholder="My App"
        required
      />
      <label htmlFor="slug">Slug</label>
      <input
        id="slug"
        value={slug}
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.target.value);
        }}
        placeholder="my-app"
        required
        pattern={"[a-z0-9\\-]{2,}"}
        title="Lowercase letters, numbers, and hyphens (min 2 chars)"
      />
      <button type="submit" className="btn" disabled={loading}>
        {loading ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}
