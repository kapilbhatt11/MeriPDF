"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function SortableItem({
  id,
  children,
}: {
  id: string;
  children: (props: {
    setActivatorNodeRef: (el: HTMLElement | null) => void;
    listeners: any;
    attributes: any;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl transition-all duration-300 select-none 
        ${isDragging 
          ? "scale-[1.03] rotate-[1.5deg] z-30 shadow-2xl ring-2 ring-indigo-500 bg-indigo-50/70 opacity-90" 
          : "hover:scale-[1.01]"
        }`}
    >
      {children({ setActivatorNodeRef, listeners, attributes, isDragging })}
    </div>
  );
}


// "use client";

// import { useSortable } from "@dnd-kit/sortable";
// import { CSS } from "@dnd-kit/utilities";

// export default function SortableItem({
//   id,
//   children,
// }: {
//   id: string;
//   children: (props: {
//     setActivatorNodeRef: (el: HTMLElement | null) => void;
//     listeners: any;
//     attributes: any;
//   }) => React.ReactNode;
// }) {
//   const {
//     attributes,
//     listeners,
//     setNodeRef,
//     setActivatorNodeRef,
//     transform,
//     transition,
//     isDragging,
//   } = useSortable({ id });

//   const style = {
//     transform: CSS.Transform.toString(transform),
//     transition,
//   };

//   return (
//     <div
//       ref={setNodeRef}
//       style={style}
//       className={`rounded-lg shadow-md transition-colors 
//         ${isDragging ? "bg-blue-100 border-2 border-blue-400" : "hover:bg-blue-50"}`}
//     >
//       {children({ setActivatorNodeRef, listeners, attributes })}
//     </div>
//   );
// }
