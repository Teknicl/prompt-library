import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  FileText,
  Folder,
  Heart,
  Inbox,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Star,
  Sun,
  Tags,
  Trash2,
  User,
} from "lucide-react";
import "./styles.css";

const API_BASE = "/api";
const TOKEN_KEY = "prompt-library-token";
const THEME_KEY = "prompt-library-theme";

const smartViews = [
  { id: "all", label: "All prompts", icon: Inbox },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "recent", label: "Recent", icon: Clock3 },
  { id: "archive", label: "Archive", icon: Archive },
];

function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) ?? "");
  const [user, setUser] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) ?? "light");
  const [appMode, setAppMode] = useState("library");
  const [activeView, setActiveView] = useState("all");
  const [activeCollectionId, setActiveCollectionId] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editorPrompt, setEditorPrompt] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", passwordConfirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    refreshData().finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    function handleKeydown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector(".command input")?.focus();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const filtered = useMemo(() => {
    return prompts
      .filter((prompt) => {
        if (activeView === "favorites" && !prompt.favorite) return false;
        if (activeView === "archive" && !prompt.archived) return false;
        if (activeView !== "archive" && prompt.archived) return false;
        if (activeCollectionId !== "All" && prompt.collectionId !== activeCollectionId) return false;
        const haystack = `${prompt.title} ${prompt.collection} ${prompt.tags.join(" ")} ${prompt.body}`.toLowerCase();
        return haystack.includes(query.toLowerCase());
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  }, [activeCollectionId, activeView, prompts, query]);

  const selected = prompts.find((prompt) => prompt.id === selectedId) ?? filtered[0] ?? prompts[0];
  const favoritePrompts = prompts.filter((prompt) => prompt.favorite && !prompt.archived).slice(0, 4);

  useEffect(() => {
    if (!selected && prompts[0]) setSelectedId(prompts[0].id);
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [prompts, selected, selectedId]);

  useEffect(() => {
    if (!selected) {
      setEditorPrompt(null);
      return;
    }

    setEditorPrompt({
      id: selected.id,
      title: selected.title,
      body: selected.body,
      tagsText: selected.tags.join(", "),
    });
  }, [selected?.id]);

  useEffect(() => {
    if (!selected || !editorPrompt || editorPrompt.id !== selected.id) return;

    const patch = {};
    if (editorPrompt.title !== selected.title) patch.title = editorPrompt.title;
    if (editorPrompt.body !== selected.body) patch.body = editorPrompt.body;

    const nextTags = editorPrompt.tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const currentTagsText = selected.tags.join(", ");
    if (editorPrompt.tagsText !== currentTagsText) patch.tags = nextTags;

    if (!Object.keys(patch).length) return;

    const timeoutId = window.setTimeout(() => {
      updatePrompt(selected.id, patch);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [editorPrompt, selected]);

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers ?? {}),
        },
      });
    } catch {
      throw new Error("The app backend is not reachable. Restart the app with npm run dev, then try again.");
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Request failed");
    return payload;
  }

  function applyPayload(payload) {
    setUser(payload.user ?? user);
    setCollections(payload.collections ?? []);
    setPrompts(payload.prompts ?? []);
    if (payload.prompts?.length) {
      setSelectedId((current) => (payload.prompts.some((prompt) => prompt.id === current) ? current : payload.prompts[0].id));
    }
  }

  async function refreshData() {
    try {
      applyPayload(await api("/me"));
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setUser(null);
      setPrompts([]);
      setCollections([]);
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    setError("");
    if (authMode === "register" && authForm.password !== authForm.passwordConfirm) {
      setError("The passwords don't match.");
      return;
    }
    try {
      const payload = await fetch(`${API_BASE}/auth/${authMode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
        }),
      }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Authentication failed");
        return body;
      });
      localStorage.setItem(TOKEN_KEY, payload.token);
      setToken(payload.token);
      applyPayload(payload);
    } catch (authError) {
      setError(
        authError instanceof TypeError
          ? "The app backend is not reachable. Restart the app with npm run dev, then try again."
          : authError.message,
      );
    }
  }

  async function logout() {
    if (token) await api("/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setPrompts([]);
    setCollections([]);
    setProfileOpen(false);
  }

  async function updatePrompt(id, patch) {
    const payload = await api(`/prompts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    applyPayload(payload);
  }

  async function addPrompt(collectionId = activeCollectionId) {
    const fallbackId = collections[0]?.id;
    const targetId = collectionId === "All" ? fallbackId : collectionId;
    const payload = await api("/prompts", { method: "POST", body: JSON.stringify({ collectionId: targetId }) });
    applyPayload(payload);
    const newest = payload.prompts[0];
    setSelectedId(newest.id);
    setActiveView("all");
    setActiveCollectionId(newest.collectionId);
    setAppMode("library");
    setMoreOpen(false);
  }

  async function addCollection(name = newCollectionName) {
    let trimmed = name.trim();
    if (!trimmed) return null;
    const existing = collections.find((collection) => collection.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setActiveCollectionId(existing.id);
      setNewCollectionName("");
      return existing;
    }
    if (trimmed === "New collection") {
      let suffix = 2;
      while (collections.some((collection) => collection.name.toLowerCase() === trimmed.toLowerCase())) {
        trimmed = `New collection ${suffix}`;
        suffix += 1;
      }
    }
    const payload = await api("/collections", { method: "POST", body: JSON.stringify({ name: trimmed }) });
    applyPayload(payload);
    const created = payload.collections.find((collection) => collection.name.toLowerCase() === trimmed.toLowerCase());
    if (created) setActiveCollectionId(created.id);
    setNewCollectionName("");
    return created;
  }

  async function createAndAssignCollection() {
    const name = newCollectionName.trim();
    if (!name || !selected) return;
    const collection = await addCollection(name);
    if (collection) await updatePrompt(selected.id, { collectionId: collection.id });
  }

  async function deletePrompt(id) {
    const payload = await api(`/prompts/${id}`, { method: "DELETE" });
    applyPayload(payload);
    setMoreOpen(false);
  }

  async function deleteCollection(id) {
    const payload = await api(`/collections/${id}`, { method: "DELETE" });
    applyPayload(payload);
    if (activeCollectionId === id) setActiveCollectionId("All");
  }

  async function copyPrompt() {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.body);
    setCopied(true);
    await updatePrompt(selected.id, { uses: selected.uses + 1 });
    window.setTimeout(() => setCopied(false), 1300);
  }

  function updateEditorPrompt(patch) {
    setEditorPrompt((current) => (current ? { ...current, ...patch } : current));
  }

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <Sparkles size={20} />
          <h1>Loading your library</h1>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-logo">
          <span className="auth-logo-mark">
            <Sparkles size={28} />
          </span>
          <span>Prompt Library</span>
        </div>
        <form className="auth-panel" onSubmit={submitAuth}>
          <h1>{authMode === "login" ? "Login" : "Create an account"}</h1>
          {authMode === "register" && (
            <label className="auth-field">
              <User size={15} />
              <input
                value={authForm.name}
                onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                placeholder="Name"
                type="text"
              />
            </label>
          )}
          <label className="auth-field">
            <Mail size={15} />
            <input
              value={authForm.email}
              onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
              placeholder="Email"
              type="email"
            />
          </label>
          <label className="auth-field">
            <Lock size={15} />
            <input
              value={authForm.password}
              onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
              placeholder="Password"
              type="password"
            />
          </label>
          {authMode === "register" && (
            <label className="auth-field">
              <Lock size={15} />
              <input
                value={authForm.passwordConfirm}
                onChange={(event) => setAuthForm({ ...authForm, passwordConfirm: event.target.value })}
                placeholder="Re-enter password"
                type="password"
              />
            </label>
          )}
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-action auth-submit" type="submit">
            <LogIn size={16} />
            {authMode === "login" ? "Login" : "Create account"}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setAuthMode(authMode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {authMode === "login" ? "Create an account" : "Back to login"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="rail">
        <button className="brand-button" aria-label="Prompt Library">
          <Sparkles size={18} />
        </button>
        <IconButton icon={BookOpen} label="Library" active={appMode === "library"} onClick={() => setAppMode("library")} />
        <IconButton icon={LayoutGrid} label="Collections" active={appMode === "collections"} onClick={() => setAppMode("collections")} />
        <IconButton icon={Settings2} label="Settings" active={appMode === "settings"} onClick={() => setAppMode("settings")} />
        <div className="profile-slot">
          <button className="profile-button" onClick={() => setProfileOpen((open) => !open)} aria-label="Profile">
            <User size={17} />
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <strong>{user.name || user.email}</strong>
              <button onClick={logout}>
                <LogOut size={15} />
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      <aside className="sidebar">
        <div className="workspace">
          <div>
            <p>Library</p>
            <h1>{possessiveName(user.name || user.email)} Prompt Library</h1>
          </div>
          <button className="tiny-icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <nav className="nav-section">
          {smartViews.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${activeView === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => {
                  setAppMode("library");
                  setActiveView(item.id);
                }}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                <span className="nav-count">{viewCount(item.id, prompts)}</span>
              </button>
            );
          })}
        </nav>

        <div className="section-label">
          <span>Collections</span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-section">
          <button
            className={`nav-item ${activeCollectionId === "All" ? "active" : ""}`}
            onClick={() => {
              setAppMode("library");
              setActiveCollectionId("All");
            }}
          >
            <Folder size={15} />
            <span>All</span>
            <span className="nav-count">{prompts.filter((item) => !item.archived).length}</span>
          </button>
          {collections.map((collection) => (
            <button
              className={`nav-item ${activeCollectionId === collection.id ? "active" : ""}`}
              key={collection.id}
              onClick={() => {
                setAppMode("library");
                setActiveCollectionId(collection.id);
              }}
            >
              <span className={`dot ${collection.color}`} />
              <span>{collection.name}</span>
              <span className="nav-count">{prompts.filter((item) => item.collectionId === collection.id && !item.archived).length}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="command">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search prompts or press K" />
            <kbd>{navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"} K</kbd>
          </div>
          <button className="primary-action" onClick={() => addPrompt()}>
            <Plus size={16} />
            New prompt
          </button>
        </header>

        <section className="favorites-strip">
          <div className="strip-title">
            <Heart size={15} />
            Favorites
          </div>
          <div className="favorite-list">
            {favoritePrompts.map((prompt) => (
              <button className="favorite-pill" key={prompt.id} onClick={() => setSelectedId(prompt.id)}>
                <span className={`dot ${collectionColor(prompt.collectionId, collections)}`} />
                {prompt.title}
              </button>
            ))}
          </div>
        </section>

        {appMode === "library" && selected && (
          <section className="content-grid">
            <div className="library-pane">
              <div className="pane-heading">
                <div>
                  <p>{filtered.length} prompts</p>
                  <h2>{activeView === "all" ? "Recently saved" : smartViews.find((item) => item.id === activeView)?.label}</h2>
                </div>
                <button className="quiet-button">
                  <Settings2 size={15} />
                  Filters
                </button>
              </div>

              <div className="prompt-table">
                {filtered.map((prompt) => (
                  <button
                    className={`prompt-row ${selected?.id === prompt.id ? "selected" : ""}`}
                    key={prompt.id}
                    onClick={() => setSelectedId(prompt.id)}
                  >
                    <span className="row-icon">{promptIcon(prompt.collection)}</span>
                    <span className="row-main">
                      <strong>{prompt.title}</strong>
                      <span>{prompt.body}</span>
                    </span>
                    <span className="tag-stack">
                      {prompt.tags.slice(0, 2).map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </span>
                    <span className="row-meta">{prompt.updated}</span>
                    <Star className={prompt.favorite ? "star filled" : "star"} size={16} />
                  </button>
                ))}
              </div>
            </div>

            <aside className="detail-pane">
              <div className="detail-actions">
                <button
                  className={`tiny-icon ${selected.favorite ? "is-favorite" : ""}`}
                  onClick={() => updatePrompt(selected.id, { favorite: !selected.favorite })}
                  aria-label="Favorite prompt"
                >
                  <Star size={16} />
                </button>
                <button className="tiny-icon" onClick={copyPrompt} aria-label="Copy prompt">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button
                  className="tiny-icon"
                  onClick={() => updatePrompt(selected.id, { archived: !selected.archived })}
                  aria-label="Archive prompt"
                >
                  {selected.archived ? <Inbox size={16} /> : <Archive size={16} />}
                </button>
                <div className="menu-wrap">
                  <button className="tiny-icon" onClick={() => setMoreOpen((open) => !open)} aria-label="More">
                    <MoreHorizontal size={16} />
                  </button>
                  {moreOpen && (
                    <div className="dropdown-menu">
                      <button onClick={() => deletePrompt(selected.id)}>
                        <Trash2 size={15} />
                        Delete prompt
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <input
                className="title-input"
                value={editorPrompt?.title ?? ""}
                onChange={(event) => updateEditorPrompt({ title: event.target.value })}
              />

              <div className="field-row">
                <label>
                  <Folder size={14} />
                  Collection
                </label>
                <select value={selected.collectionId} onChange={(event) => updatePrompt(selected.id, { collectionId: Number(event.target.value) })}>
                  {collections.map((collection) => (
                    <option value={collection.id} key={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-row">
                <label>
                  <Plus size={14} />
                  New
                </label>
                <div className="inline-create">
                  <input
                    value={newCollectionName}
                    onChange={(event) => setNewCollectionName(event.target.value)}
                    placeholder="Add collection"
                  />
                  <button className="tiny-icon" onClick={createAndAssignCollection} aria-label="Add collection">
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <div className="field-row">
                <label>
                  <Tags size={14} />
                  Tags
                </label>
                <input
                  value={editorPrompt?.tagsText ?? ""}
                  onChange={(event) => updateEditorPrompt({ tagsText: event.target.value })}
                />
              </div>

              <textarea value={editorPrompt?.body ?? ""} onChange={(event) => updateEditorPrompt({ body: event.target.value })} />

              <div className="meta-grid">
                <Metric icon={Clock3} label="Updated" value={selected.updated} />
                <Metric icon={Copy} label="Copied" value={`${selected.uses} times`} />
                <Metric icon={FileText} label="Versions" value={`${selected.versions} saved`} />
              </div>

              <div className="history">
                <div className="section-label plain">
                  <span>Older prompts</span>
                </div>
                {["Current version", "Edited yesterday", "Tone pass", "Original draft"].map((item, index) => (
                  <div className="history-row" key={item}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{item}</strong>
                      <p>{index === 0 ? selected.updated : `${index + 1}d ago`}</p>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </section>
        )}

        {appMode === "collections" && (
          <section className="board-view">
            <div className="board-heading">
              <div>
                <p>{collections.length} collections</p>
                <h2>Collections</h2>
              </div>
              <button className="quiet-button" onClick={() => addCollection("New collection")}>
                <Plus size={15} />
                Collection
              </button>
            </div>

            <div className="collection-board">
              {collections.map((collection) => {
                const collectionPrompts = prompts.filter((prompt) => prompt.collectionId === collection.id && !prompt.archived);
                return (
                  <section className="collection-column" key={collection.id}>
                    <div className="column-heading">
                      <div>
                        <span className={`dot ${collection.color}`} />
                        <h3>{collection.name}</h3>
                      </div>
                      <button className="tiny-icon" onClick={() => addPrompt(collection.id)} aria-label={`Add prompt to ${collection.name}`}>
                        <Plus size={15} />
                      </button>
                    </div>
                    <div className="column-cards">
                      {collectionPrompts.map((prompt) => (
                        <button
                          className="collection-card"
                          key={prompt.id}
                          onClick={() => {
                            setSelectedId(prompt.id);
                            setActiveCollectionId(collection.id);
                            setAppMode("library");
                          }}
                        >
                          <strong>{prompt.title}</strong>
                          <span>{prompt.body}</span>
                          <small>{prompt.versions} versions - {prompt.updated}</small>
                        </button>
                      ))}
                      {!collectionPrompts.length && (
                        <button className="empty-card" onClick={() => addPrompt(collection.id)}>
                          <Plus size={15} />
                          Add prompt
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        )}

        {appMode === "settings" && (
          <section className="settings-view">
            <div className="board-heading">
              <div>
                <p>Manage library</p>
                <h2>Settings</h2>
              </div>
            </div>

            <div className="settings-panel">
              <div className="settings-copy">
                <h3>Collections</h3>
                <p>Delete collection names from the left navigation. Prompts in a deleted collection move into the first remaining collection.</p>
              </div>
              <div className="new-collection-row">
                <input
                  value={newCollectionName}
                  onChange={(event) => setNewCollectionName(event.target.value)}
                  placeholder="New collection name"
                />
                <button className="primary-action" onClick={() => addCollection()}>
                  <Plus size={15} />
                  Add
                </button>
              </div>
              <div className="settings-list">
                {collections.map((collection) => (
                  <div className="settings-row" key={collection.id}>
                    <span className={`dot ${collection.color}`} />
                    <strong>{collection.name}</strong>
                    <span>{prompts.filter((prompt) => prompt.collectionId === collection.id && !prompt.archived).length} prompts</span>
                    <button className="danger-button" onClick={() => deleteCollection(collection.id)}>
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function IconButton({ icon: Icon, label, active, onClick }) {
  return (
    <button className={`rail-button ${active ? "active" : ""}`} onClick={onClick} aria-label={label} title={label}>
      <Icon size={18} />
    </button>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function collectionColor(collectionId, collections) {
  return collections.find((item) => item.id === collectionId)?.color ?? "blue";
}

function viewCount(view, prompts) {
  if (view === "favorites") return prompts.filter((prompt) => prompt.favorite && !prompt.archived).length;
  if (view === "archive") return prompts.filter((prompt) => prompt.archived).length;
  if (view === "recent") return prompts.filter((prompt) => !prompt.archived).slice(0, 4).length;
  return prompts.filter((prompt) => !prompt.archived).length;
}

function promptIcon(collection) {
  const map = {
    Writing: <PenLine size={16} />,
    Engineering: <Code2 size={16} />,
    Research: <MessageSquareText size={16} />,
    Support: <MessageSquareText size={16} />,
    Operations: <FileText size={16} />,
  };
  return map[collection] ?? <FileText size={16} />;
}

function possessiveName(name) {
  const trimmed = name.trim();
  return trimmed.endsWith("s") ? `${trimmed}'` : `${trimmed}'s`;
}

createRoot(document.getElementById("root")).render(<App />);
