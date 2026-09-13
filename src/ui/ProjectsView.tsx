import { useEffect, useState } from "react";
import { useProject } from "../state/project";
import { openFolderPicker } from "./CommandPalette";
import { useUi } from "../state/ui";
import { useSettings } from "../state/settings";
import { api } from "../core/api/ipc";
import { IconFolder, IconX, IconRefresh } from "./icons";

export function ProjectsView() {
  const { root, name, git, refreshTree, refreshGit, closeProject } = useProject();
  const { settings, update } = useSettings();
  const [inspect, setInspect] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (root) {
      api.projectInspect(root).then(setInspect).catch(() => setInspect(null));
    }
  }, [root]);

  return (
    <div className="projects">
      <h2>Projects</h2>
      {root ? (
        <div className="project-card">
          <div className="project-card-head">
            <IconFolder size={15} />
            <span className="project-name">{name}</span>
            <span className="project-path">{root}</span>
            <span className="spacer" />
            <button className="icon-btn" onClick={() => { void refreshTree(); void refreshGit(); }} title="Refresh" aria-label="Refresh project">
              <IconRefresh size={13} />
            </button>
            <button className="icon-btn" onClick={closeProject} title="Close project" aria-label="Close project">
              <IconX size={13} />
            </button>
          </div>
          <div className="project-meta">
            {git?.isRepo ? (
              <>
                <span className="tag git">git · {git.branch}</span>
                <span className={git.clean ? "dim" : "warn"}>
                  {git.clean ? "working tree clean" : `${git.entries.length} changed file(s)`}
                </span>
              </>
            ) : (
              <span className="dim">not a git repository</span>
            )}
            {inspect?.fileCount != null && (
              <span className="dim">{String(inspect.fileCount)} files (top levels)</span>
            )}
          </div>
          {git && !git.clean && git.entries.length > 0 && (
            <div className="project-git-entries">
              {git.entries.slice(0, 12).map((e, i) => (
                <div key={i} className="git-entry">
                  <span className={`git-status ${e.status}`}>{e.status}</span>
                  <span>{e.path}</span>
                </div>
              ))}
              {git.entries.length > 12 && <div className="dim">+{git.entries.length - 12} more…</div>}
            </div>
          )}
        </div>
      ) : (
        <div className="project-card empty-card">
          <p>No project open. Open a folder to give the agent file context.</p>
        </div>
      )}

      <button className="btn primary" onClick={() => void openFolderPicker()}>
        <IconFolder size={14} /> Open folder…
      </button>

      <h3>Recent projects</h3>
      <div className="recent-projects">
        {settings.projects.recent.length === 0 && <p className="dim">No recent projects</p>}
        {settings.projects.recent.map((p) => (
          <div key={p} className={`recent-project${p === root ? " active" : ""}`}>
            <button
              className="recent-open"
              onClick={async () => {
                await useProject.getState().openProject(p);
                useUi.getState().setView("chat");
              }}
            >
              <IconFolder size={13} /> {p.split(/[\\/]/).filter(Boolean).pop()} <span className="dim path">{p}</span>
            </button>
            <button
              className="icon-btn"
              aria-label="Remove from recent"
              onClick={() => {
                void update((s) => {
                  s.projects.recent = s.projects.recent.filter((x) => x !== p);
                  if (s.projects.active === p) s.projects.active = null;
                });
              }}
            >
              <IconX size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

