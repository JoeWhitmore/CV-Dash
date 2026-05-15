export interface JiraSprintListResponse {
  maxResults: number;
  startAt: number;
  isLast: boolean;
  values: JiraSprint[];
}

export interface JiraSprint {
  id: number;
  name: string;
  state: "active" | "future" | "closed";
  startDate?: string;
  endDate?: string;
  originBoardId: number;
}

export interface JiraIssueSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraIssue {
  key: string;
  fields: JiraIssueFields;
}

export interface JiraIssueFields {
  summary: string;
  status: { name: string };
  issuetype: { name: string };
  assignee: JiraUser | null;
  updated: string;
  [customField: string]: unknown;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  avatarUrls?: Record<string, string>;
}
