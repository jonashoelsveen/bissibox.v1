/**
 * ProjectsSection — Macro left-rail: project list, or phases when a project
 * is open (drill-in). Row click opens a project; eye still hides Gantt blocks.
 */

import { useMemo } from "react";
import { useUserCategories } from "@/hooks/useUserCategories";
import { defaultGanttWeekSpan } from "./ganttWeeks";
import { GANTT_WEEK_HEADER_H } from "./GanttYearGrid";
import { useMacroProjectNav } from "./MacroProjectNavContext";
import {
  GANTT_PROJECT_ROW_HEIGHT,
  MeCategorySection,
} from "./MeCategorySection";

export function ProjectsSection({
  teamId = null,
  year,
}: {
  teamId?: string | null;
  /** Calendar year shown in the Macro Gantt (drives default 4-week span). */
  year: number;
}) {
  const { openProjectId, setOpenProjectId } = useMacroProjectNav();
  const { categories: projects, update: updateProject, remove: removeProject } = useUserCategories({
    kind: "gantt_project",
    teamId,
  });
  const openProject = useMemo(
    () => (openProjectId ? projects.find((p) => p.id === openProjectId) ?? null : null),
    [projects, openProjectId],
  );

  const { categories: phases, update: updatePhase } = useUserCategories({
    kind: "gantt_phase",
    teamId,
    parentId: openProjectId,
  });

  const projectHidden = useMemo(() => {
    const s = new Set<string>();
    for (const c of projects) if (c.hidden) s.add(c.id);
    return s;
  }, [projects]);

  const phaseHidden = useMemo(() => {
    const s = new Set<string>();
    for (const c of phases) if (c.hidden) s.add(c.id);
    return s;
  }, [phases]);

  if (openProjectId && openProject) {
    return (
      <MeCategorySection
        title={openProject.name}
        kind="gantt_phase"
        createName="New phase"
        teamId={teamId}
        parentId={openProjectId}
        hidden={phaseHidden}
        onToggleHidden={(id) => {
          const c = phases.find((x) => x.id === id);
          if (!c) return;
          void updatePhase(c.id, { hidden: !c.hidden });
        }}
        rowClickTogglesHidden={false}
        hidePin
        rowHeight={GANTT_PROJECT_ROW_HEIGHT}
        listOffsetTop={GANTT_WEEK_HEADER_H}
        createSpan={() => defaultGanttWeekSpan(year)}
        onBack={() => setOpenProjectId(null)}
        headerCategory={openProject}
        onHeaderColorChange={(hex) => {
          void updateProject(openProject.id, { color: hex });
        }}
        onHeaderRename={(name) => updateProject(openProject.id, { name })}
        onHeaderDelete={() => {
          void removeProject(openProject.id);
          setOpenProjectId(null);
        }}
        defaultOpen
      />
    );
  }

  // Stale open id (deleted project) — fall back to list.
  if (openProjectId && !openProject) {
    setOpenProjectId(null);
  }

  return (
    <MeCategorySection
      title="Projects"
      kind="gantt_project"
      createName="New project"
      teamId={teamId}
      hidden={projectHidden}
      onToggleHidden={(id) => {
        const c = projects.find((x) => x.id === id);
        if (!c) return;
        void updateProject(c.id, { hidden: !c.hidden });
      }}
      onRowActivate={(id) => setOpenProjectId(id)}
      hidePin
      rowHeight={GANTT_PROJECT_ROW_HEIGHT}
      listOffsetTop={GANTT_WEEK_HEADER_H}
      defaultOpen
    />
  );
}
