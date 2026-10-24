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
    <form
      onSubmit={handleSubmit}
      aria-describedby={error ? "project-error" : undefined}
    >
      {error && (
        <div id="project-error" role="alert" className="form-error">
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
        maxLength={200}
        aria-invalid={error ? true : undefined}
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
      <button
        type="submit"
        className="btn"
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}
