export type ShiftCode = 'F' | 'S' | 'N'
export type JobStatus = 'done' | 'running' | 'open' | 'blocked'
export type JobProgressState = 'done' | 'partial' | 'not_done' | 'su'
export type Role = 'Operator' | 'Supervisor' | 'Admin' | 'Viewer'

export type DemoUser = {
  id: string
  name: string
  role: Role
  shift?: ShiftCode
  assignedRobotIds: string[]
}

export type Robot = {
  id: string
  assetId: string
  name: string
  imageSrc: string
  location: string
  process: 'Laser Welding' | 'Laser Cutting'
  optics: ('ALO' | 'BEO')[]
}

export type ShiftPlan = {
  id: string
  date: string
  day: string
  shift: ShiftCode
  shiftName: string
  time: string
  robotId: string
  targetUtilization: number
  jobs: ProductionJob[]
}

export type ProductionJob = {
  id: string
  faNumber: string
  project: string
  articleNo: string
  step: string
  fixture: string
  optic?: 'ALO' | 'BEO'
  wireNumber?: string
  vr: number
  station: number
  plannedQty: number
  doneQty: number
  status: JobStatus
  priority: 'carryover' | 'normal' | 'low'
  operatorNote?: string
  welderNote?: string
  delayReason?: string
  carriedFrom?: ShiftCode
  kapaBedienerMin: number
  schlosserMin: number
  anlageMin: number
  ruestzeitMin: number
}

export type ShiftDelay = {
  id: string
  robotId: string
  shift: ShiftCode
  minutes: number
  reason: string
  comment: string
}

export type ShiftStaffAssignment = {
  id: string
  date: string
  robotIds: string[]
  shift: ShiftCode
  operator: string
  welders: string[]
  note?: string
}

export const demoUsers: DemoUser[] = [
  {
    id: 'user-operator-f',
    name: 'M. Weber',
    role: 'Operator',
    shift: 'F',
    assignedRobotIds: ['ap2904', 'ap2345', 'ap3562'],
  },
  {
    id: 'user-operator-s',
    name: 'L. Schmidt',
    role: 'Operator',
    shift: 'S',
    assignedRobotIds: ['ap2904', 'ap2418'],
  },
  {
    id: 'user-supervisor',
    name: 'S. Keller',
    role: 'Supervisor',
    assignedRobotIds: ['ap2345', 'ap2418', 'ap2670', 'ap2904', 'ap3159', 'ap3286', 'ap3374', 'ap3421', 'ap3562', 'ap3617', 'ap3740'],
  },
  {
    id: 'user-admin',
    name: 'A. Fischer',
    role: 'Admin',
    assignedRobotIds: ['ap2345', 'ap2418', 'ap2670', 'ap2904', 'ap3159', 'ap3286', 'ap3374', 'ap3421', 'ap3562', 'ap3617', 'ap3740'],
  },
  {
    id: 'user-viewer',
    name: 'Read Only Board',
    role: 'Viewer',
    shift: 'F',
    assignedRobotIds: ['ap2904'],
  },
]

export const robots: Robot[] = [
  { id: 'ap2345', assetId: 'AP2345', name: 'Freya', imageSrc: '/robot-images/robot-card-1.jpg', process: 'Laser Welding', optics: ['ALO', 'BEO'], location: 'Halle 1' },
  { id: 'ap2418', assetId: 'AP2418', name: 'Donna', imageSrc: '/robot-images/robot-card-2.jpg', process: 'Laser Welding', optics: ['ALO', 'BEO'], location: 'Halle 1' },
  { id: 'ap2670', assetId: 'AP2670', name: 'Jana', imageSrc: '/robot-images/robot-card-3.jpg', process: 'Laser Welding', optics: ['ALO', 'BEO'], location: 'Halle 2' },
  { id: 'ap2904', assetId: 'AP2904', name: 'Pesa', imageSrc: '/robot-images/robot-card-1.jpg', process: 'Laser Cutting', optics: ['ALO', 'BEO'], location: 'Halle 2' },
  { id: 'ap3159', assetId: 'AP3159', name: 'Kabine B', imageSrc: '/robot-images/robot-card-2.jpg', process: 'Laser Cutting', optics: ['ALO'], location: 'Halle 3' },
  { id: 'ap3286', assetId: 'AP3286', name: 'Kabine C', imageSrc: '/robot-images/robot-card-3.jpg', process: 'Laser Welding', optics: ['ALO'], location: 'Halle 2' },
  { id: 'ap3374', assetId: 'AP3374', name: 'Kabine D', imageSrc: '/robot-images/robot-card-1.jpg', process: 'Laser Welding', optics: ['ALO'], location: 'Halle 3' },
  { id: 'ap3421', assetId: 'AP3421', name: 'Kabine V', imageSrc: '/robot-images/robot-card-2.jpg', process: 'Laser Welding', optics: ['ALO', 'BEO'], location: 'Halle 3' },
  { id: 'ap3562', assetId: 'AP3562', name: 'Gina', imageSrc: '/robot-images/robot-card-3.jpg', process: 'Laser Welding', optics: ['ALO', 'BEO'], location: 'Halle 1' },
  { id: 'ap3617', assetId: 'AP3617', name: 'Emma', imageSrc: '/robot-images/robot-card-1.jpg', process: 'Laser Welding', optics: ['ALO', 'BEO'], location: 'Halle 2' },
  { id: 'ap3740', assetId: 'AP3740', name: 'Kabine A', imageSrc: '/robot-images/robot-card-2.jpg', process: 'Laser Cutting', optics: ['ALO'], location: 'Halle 2' },
]

const makeJob = (
  id: string,
  faNumber: string,
  project: string,
  articleNo: string,
  step: string,
  fixture: string,
  plannedQty: number,
  doneQty: number,
  status: JobStatus,
  priority: ProductionJob['priority'],
  extra?: Partial<ProductionJob>,
): ProductionJob => ({
  id,
  faNumber,
  project,
  articleNo,
  step,
  fixture,
  vr: 3,
  station: 1,
  plannedQty,
  doneQty,
  status,
  priority,
  kapaBedienerMin: -40,
  schlosserMin: 40,
  anlageMin: 30,
  ruestzeitMin: 0,
  ...extra,
})

export const todayPlan: ShiftPlan[] = [
  {
    id: 'shift-f-2026-06-08-ap2904',
    date: '08.06.2026',
    day: 'Montag',
    shift: 'F',
    shiftName: 'Fruehschicht',
    time: '06:00 - 14:00',
    robotId: 'ap2904',
    targetUtilization: 20,
    jobs: [
      makeJob('job-001', 'FA-240611-095', 'Pesa TB', '100-01', 'Schritt 1', 'Vorrichtung A', 1, 1, 'done', 'normal'),
      makeJob('job-002', 'FA-240611-096', 'Pesa TB', '100-02', 'Schritt 1', 'Vorrichtung B', 1, 0, 'running', 'normal', {
        optic: 'ALO',
        wireNumber: '14316',
        welderNote: 'mit T8 heften',
      }),
      makeJob('job-003', 'FA-240611-097', 'Pesa', '95', 'Schritt 1', 'Vorrichtung A', 2, 2, 'done', 'normal'),
      makeJob('job-004', 'FA-240611-098', 'Pesa', '95', 'Schritt 2', 'Vorrichtung B', 2, 1, 'running', 'normal', {
        optic: 'BEO',
        wireNumber: '14316',
        operatorNote: 'ein Bauteil wartet auf Kontrolle',
        welderNote: 'mit T8 heften',
      }),
      makeJob('job-005', 'FA-240611-099', 'Pesa TB', '101-44', 'Schritt 3', 'Vorrichtung C', 3, 0, 'open', 'low'),
    ],
  },
  {
    id: 'shift-s-2026-06-08-ap2904',
    date: '08.06.2026',
    day: 'Montag',
    shift: 'S',
    shiftName: 'Spaetschicht',
    time: '14:00 - 22:00',
    robotId: 'ap2904',
    targetUtilization: 20,
    jobs: [
      makeJob('job-006', 'FA-240611-098', 'Pesa', '95', 'Schritt 2', 'Vorrichtung B', 1, 0, 'open', 'carryover', {
        carriedFrom: 'F',
        operatorNote: 'Restmenge aus Fruehschicht',
        welderNote: 'zuerst vorbereiten',
      }),
      makeJob('job-007', 'FA-240611-099', 'Pesa TB', '101-44', 'Schritt 3', 'Vorrichtung C', 3, 0, 'open', 'normal'),
      makeJob('job-008', 'FA-240611-100', 'Pesa TB', '102-11', 'Schritt 1', 'Vorrichtung A', 1, 0, 'open', 'normal', {
        optic: 'ALO',
      }),
      makeJob('job-009', 'FA-240611-101', 'Pesa TB', '103-06', 'Schritt 2', 'Vorrichtung B', 2, 0, 'open', 'low'),
    ],
  },
  {
    id: 'shift-n-2026-06-09-ap2904',
    date: '09.06.2026',
    day: 'Dienstag',
    shift: 'N',
    shiftName: 'Nachtschicht',
    time: '22:00 - 06:00',
    robotId: 'ap2904',
    targetUtilization: 20,
    jobs: [
      makeJob('job-010', 'FA-240611-100', 'Pesa TB', '102-11', 'Schritt 1', 'Vorrichtung A', 1, 0, 'open', 'carryover', {
        carriedFrom: 'S',
        operatorNote: 'falls Spaetschicht nicht fertig wird',
      }),
      makeJob('job-011', 'FA-240611-102', 'Pesa TB', '103-07', 'Schritt 2', 'Vorrichtung B', 2, 0, 'open', 'normal'),
      makeJob('job-012', 'FA-240611-103', 'Pesa', '95', 'Schritt 1', 'Vorrichtung A', 4, 0, 'open', 'normal'),
    ],
  },
]

export const delayReasons = [
  'Bauteil nicht geheftet',
  'Stapeln zu spaet',
  'Nacharbeit / Reparatur',
  'Schweissnaht reparieren',
  'Neues Programm installiert',
  'Roboter Crash',
  'Anlage Stoerung',
  'Material fehlt',
  'Qualitaetskontrolle',
  'Sonstiges',
]

export const shiftDelays: ShiftDelay[] = [
  {
    id: 'delay-001',
    robotId: 'ap2904',
    shift: 'F',
    minutes: 30,
    reason: 'Neues Programm installiert',
    comment: 'Programmwechsel fuer Pesa TB hat die erste halbe Stunde blockiert.',
  },
]

export const shiftStaffAssignments: ShiftStaffAssignment[] = [
  {
    id: 'staff-f-weber',
    date: '08.06.2026',
    robotIds: ['ap2904', 'ap2345'],
    shift: 'F',
    operator: 'M. Weber',
    welders: ['T. Braun', 'K. Yilmaz'],
    note: 'Pesa zuerst, Freya bei Bedarf mitbetreuen',
  },
  {
    id: 'staff-f-hartmann',
    date: '08.06.2026',
    robotIds: ['ap3562'],
    shift: 'F',
    operator: 'J. Hartmann',
    welders: ['A. Novak', 'S. Ali'],
  },
  {
    id: 'staff-s-schmidt',
    date: '08.06.2026',
    robotIds: ['ap2904', 'ap2418', 'ap2670'],
    shift: 'S',
    operator: 'L. Schmidt',
    welders: ['B. Klein', 'R. Osman'],
    note: 'Bis zu drei Anlagen, Restpositionen zuerst',
  },
  {
    id: 'staff-n-becker',
    date: '09.06.2026',
    robotIds: ['ap2904'],
    shift: 'N',
    operator: 'N. Becker',
    welders: ['P. Wagner', 'M. Hoffmann'],
  },
]

export const upcomingPages = [
  {
    id: 'daily-plan',
    title: 'Tagesplan Live',
    description: 'F/S/N-Plan als Leseansicht mit QR und Druckansicht fuer Schlosser.',
  },
  {
    id: 'operator-board',
    title: 'Bediener-Board',
    description: 'Anmelden, Anlage waehlen, Fertig markieren und Ist-Menge eintragen.',
  },
  {
    id: 'weekly-planner',
    title: 'Wochenplanung',
    description: 'Planung erstellt den Wochenplan fuer jede Anlage und Schicht.',
  },
  {
    id: 'handover',
    title: 'Schichtuebergabe',
    description: 'Offene Positionen wandern automatisch in die naechste Schicht.',
  },
  {
    id: 'print-center',
    title: 'Druckzentrum',
    description: 'Saubere Schichtblaetter und Schlosser-Vorbereitungslisten erzeugen.',
  },
  {
    id: 'reports',
    title: 'Berichte',
    description: 'Soll/Ist, Reste, Blocker und Auslastung.',
  },
]
