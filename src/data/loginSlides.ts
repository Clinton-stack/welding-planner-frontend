import type { LoginSlide } from '../components/LoginSlideshow'

export const loginSlides: LoginSlide[] = [
  {
    id: 'shift-planning',
    imageSrc: '/robot-images/robot-card-1.jpg',
    title: 'Schicht planen, bevor die Anlage startet',
    caption: 'Wochenziele, Schichtprioritaeten und Bauteile bleiben fuer jede Anlage sichtbar.',
  },
  {
    id: 'operator-progress',
    imageSrc: '/robot-images/robot-card-2.jpg',
    title: 'Bediener melden fertige Mengen',
    caption: 'Jeder Bediener markiert, was fertig ist, was offen ist und warum etwas nicht abgeschlossen wurde.',
  },
  {
    id: 'handover',
    imageSrc: '/robot-images/robot-card-3.jpg',
    title: 'Reste gehen in die naechste Schicht',
    caption: 'Nicht fertige Bauteile werden automatisch zur Prioritaet der naechsten Schicht.',
  },
]
