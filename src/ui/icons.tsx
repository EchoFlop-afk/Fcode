import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: P): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };
}

export const IconPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconSearch = (p: P) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
  </svg>
);
export const IconSend = (p: P) => (
  <svg {...base(p)}><path d="m5 12 14-7-4 7 4 7z" /></svg>
);
export const IconStop = (p: P) => (
  <svg {...base(p)}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
export const IconChat = (p: P) => (
  <svg {...base(p)}><path d="M21 12a8 8 0 0 1-8 8H4l2.5-2.5A8 8 0 1 1 21 12z" /></svg>
);
export const IconFolder = (p: P) => (
  <svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
export const IconFile = (p: P) => (
  <svg {...base(p)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
);
export const IconChevronRight = (p: P) => (
  <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>
);
export const IconChevronDown = (p: P) => (
  <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>
);
export const IconCopy = (p: P) => (
  <svg {...base(p)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)}><path d="m4 12 5 5L20 6" /></svg>
);
export const IconX = (p: P) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconRefresh = (p: P) => (
  <svg {...base(p)}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
);
export const IconTrash = (p: P) => (
  <svg {...base(p)}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
);
export const IconEdit = (p: P) => (
  <svg {...base(p)}><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
);
export const IconPin = (p: P) => (
  <svg {...base(p)}><path d="M12 17v5M9 3h6l-1 6 4 3v2H6v-2l4-3z" /></svg>
);
export const IconTerminal = (p: P) => (
  <svg {...base(p)}><path d="m4 17 6-5-6-5" /><path d="M12 19h8" /></svg>
);
export const IconStar = (p: P) => (
  <svg {...base(p)}><path d="m12 3 2.7 5.9 6.3.7-4.7 4.3 1.3 6.1L12 16.9 6.4 20l1.3-6.1L3 9.6l6.3-.7z" /></svg>
);
export const IconBolt = (p: P) => (
  <svg {...base(p)}><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
);
export const IconBrain = (p: P) => (
  <svg {...base(p)}><path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.55A3.5 3.5 0 0 0 4.5 8.5c0 .64.17 1.23.47 1.75A3.5 3.5 0 0 0 3 13.5 3.5 3.5 0 0 0 6.5 17H7v.5A2.5 2.5 0 0 0 9.5 20h.5V2zM14.5 2A2.5 2.5 0 0 1 17 4.5v.55a3.5 3.5 0 0 1 2.5 3.45c0 .64-.17 1.23-.47 1.75a3.5 3.5 0 0 1 1.97 3.25A3.5 3.5 0 0 1 17.5 17H17v.5a2.5 2.5 0 0 1-2.5 2.5h-.5V2z" /></svg>
);
export const IconEye = (p: P) => (
  <svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconEyeOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-2.4 3.3M6.1 6.1A16.7 16.7 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 5.9-1.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3 3 18 18" />
  </svg>
);
export const IconCode = (p: P) => (
  <svg {...base(p)}><path d="m8 6-6 6 6 6M16 6l6 6-6 6" /></svg>
);
export const IconWrench = (p: P) => (
  <svg {...base(p)}><path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L14 13l-3-3z" /></svg>
);
export const IconChart = (p: P) => (
  <svg {...base(p)}><path d="M3 3v18h18" /><path d="M7 15v3M12 10v8M17 6v12" /></svg>
);
export const IconCpu = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </svg>
);
export const IconKey = (p: P) => (
  <svg {...base(p)}><circle cx="7.5" cy="15.5" r="4.5" /><path d="m11 12 9-9m-4 4 3 3m-6 0 3 3" /></svg>
);
export const IconMinus = (p: P) => (
  <svg {...base(p)}><path d="M5 12h14" /></svg>
);
export const IconMaximize = (p: P) => (
  <svg {...base(p)}><rect x="5" y="5" width="14" height="14" rx="1" /></svg>
);
export const IconAlert = (p: P) => (
  <svg {...base(p)}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
);
export const IconInfo = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M12 12v5" /></svg>
);
export const IconDownload = (p: P) => (
  <svg {...base(p)}><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
);
export const IconUpload = (p: P) => (
  <svg {...base(p)}><path d="M12 15V3m0 0 4 4m-4-4L8 7" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
);
export const IconSidebar = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
);
export const IconChecker = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <rect x="3.8" y="3.8" width="7.8" height="7.8" fill="currentColor" stroke="none" opacity="0.55" />
    <rect x="12.4" y="12.4" width="7.8" height="7.8" fill="currentColor" stroke="none" opacity="0.55" />
  </svg>
);
export const IconSave = (p: P) => (
  <svg {...base(p)}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
);
