import { ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import type { MissionCommand, MissionVehicleType } from '../domain';
import {
  getMissionCommandGroups,
  getMissionCommandLabel,
  getMissionCommandShortLabel,
  isMissionLoiterCommand,
} from './missionPlanPresentation';

export interface MissionCommandToolboxProps {
  readonly vehicleType: MissionVehicleType;
  readonly disabled: boolean;
  readonly onAddCommand: (command: MissionCommand) => void;
}

interface ToolboxCommandEntry {
  readonly type: 'command';
  readonly command: MissionCommand;
}

interface ToolboxLoiterEntry {
  readonly type: 'loiter';
  readonly commands: readonly MissionCommand[];
}

type ToolboxEntry = ToolboxCommandEntry | ToolboxLoiterEntry;

const buildToolboxEntries = (commands: readonly MissionCommand[]): readonly ToolboxEntry[] => {
  const loiterCommands = commands.filter(isMissionLoiterCommand);
  const entries: ToolboxEntry[] = [];
  let loiterEntryAdded = false;

  commands.forEach((command) => {
    if (isMissionLoiterCommand(command)) {
      if (!loiterEntryAdded) {
        entries.push({ type: 'loiter', commands: loiterCommands });
        loiterEntryAdded = true;
      }

      return;
    }

    entries.push({ type: 'command', command });
  });

  return entries;
};

export default function MissionCommandToolbox({
  vehicleType,
  disabled,
  onAddCommand,
}: MissionCommandToolboxProps) {
  const groups = getMissionCommandGroups(vehicleType);
  const [openLoiterGroup, setOpenLoiterGroup] = useState<string | null>(null);

  const handleToggleLoiterGroup = (groupTitle: string): void => {
    if (disabled) {
      return;
    }

    setOpenLoiterGroup((currentGroup) => (currentGroup === groupTitle ? null : groupTitle));
  };

  const handleAddCommand = (command: MissionCommand): void => {
    if (disabled) {
      return;
    }

    onAddCommand(command);
    setOpenLoiterGroup(null);
  };

  return (
    <aside className="mp-toolbox" aria-label="Mission command toolbox">
      {groups.map((group) => {
        const entries = buildToolboxEntries(group.commands);
        const loiterGroupOpen = openLoiterGroup === group.title;

        return (
          <section key={group.title} className="mp-toolbox__group" aria-label={group.title}>
            <div className="mp-toolbox__title">{group.title}</div>
            <div className="mp-toolbox__commands">
              {entries.map((entry) => {
                if (entry.type === 'loiter') {
                  return (
                    <div key={`${group.title}-loiter`} className="mp-toolbox__command-group">
                      <button
                        type="button"
                        className="mp-command-button mp-command-button--group"
                        disabled={disabled}
                        aria-label={`Open ${group.title} loiter command choices`}
                        aria-haspopup="menu"
                        aria-expanded={loiterGroupOpen}
                        onClick={() => handleToggleLoiterGroup(group.title)}
                      >
                        <Plus size={13} />
                        <span>Loiter</span>
                        <ChevronDown className="mp-command-button__chevron" size={13} aria-hidden="true" />
                      </button>
                      {loiterGroupOpen ? (
                        <div
                          className="mp-toolbox__submenu"
                          role="menu"
                          aria-label={`${group.title} loiter command choices`}
                        >
                          {entry.commands.map((command) => (
                            <button
                              key={command}
                              type="button"
                              className="mp-command-button mp-command-button--subcommand"
                              disabled={disabled}
                              role="menuitem"
                              title={getMissionCommandLabel(command)}
                              aria-label={`Add ${getMissionCommandShortLabel(command)} command`}
                              onClick={() => handleAddCommand(command)}
                            >
                              <Plus size={12} />
                              <span>{getMissionCommandShortLabel(command)}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <button
                    key={entry.command}
                    type="button"
                    className="mp-command-button"
                    disabled={disabled}
                    onClick={() => handleAddCommand(entry.command)}
                    title={getMissionCommandLabel(entry.command)}
                  >
                    <Plus size={13} />
                    <span>{getMissionCommandShortLabel(entry.command)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
