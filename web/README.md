# Nodalis Web (Frontend)

Interface utilisateur pour visualiser et manipuler les graphes.

## Structure

```
src/
├── components/      # Composants React (UniversalNode, GraphCanvas)
├── stores/          # Zustand stores (état global)
└── hooks/           # Hooks personnalisés (useAutoLayout)
```

## Commandes

```bash
npm run dev          # Mode développement (port 5173)
npm run build        # Build de production
npm run preview      # Preview du build
```

## Stack

- **React 19** : Framework UI
- **@xyflow/react** : Librairie de graphes (successeur de reactflow)
- **Zustand** : State management léger
- **Tailwind CSS** : Styling utility-first
- **Vite** : Build tool ultra-rapide
