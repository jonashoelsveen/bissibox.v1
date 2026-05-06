export type MeetingKind = "board" | "group";

export interface MeetingTables {
  meetings: "team_board_meetings" | "team_group_meetings";
  folders: "meeting_folders" | "team_group_meeting_folders";
  attachments: "team_board_meeting_attachments" | "team_group_meeting_attachments";
  roster: "team_board_meeting_roster" | "team_group_meeting_roster";
  attendance: "team_board_meeting_attendance" | "team_group_meeting_attendance";
  /** Storage bucket used for attachments. Reused across kinds for now. */
  storageBucket: string;
}

export function meetingTables(kind: MeetingKind): MeetingTables {
  if (kind === "group") {
    return {
      meetings: "team_group_meetings",
      folders: "team_group_meeting_folders",
      attachments: "team_group_meeting_attachments",
      roster: "team_group_meeting_roster",
      attendance: "team_group_meeting_attendance",
      storageBucket: "board-attachments",
    };
  }
  return {
    meetings: "team_board_meetings",
    folders: "meeting_folders",
    attachments: "team_board_meeting_attachments",
    roster: "team_board_meeting_roster",
    attendance: "team_board_meeting_attendance",
    storageBucket: "board-attachments",
  };
}
