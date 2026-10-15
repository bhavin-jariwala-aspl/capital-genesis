import { useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  pointerWithin, useDroppable, useDraggable,
} from '@dnd-kit/core';
import { clsx } from 'clsx';
import { GripVertical, Plus, Edit, Activity } from 'lucide-react';

/**
 * Pipeline/Kanban board.
 *
 * Props:
 *   stages:      [{ id, label, color }]
 *   cards:       [{ id, title, subtitle?, stage_id, ... }]
 *   onCardMove   (cardId, newStageId)
 *   onCardClick  (card)   — opens activity / side panel
 *   onCardEdit   (card)   — navigates to edit page
 *   onAddCard    (stageId)
 *   renderCard   (card)   — optional custom card body renderer
 */
export default function Pipeline({
  stages = [],
  cards = [],
  onCardMove,
  onCardClick,
  onCardEdit,
  onAddCard,
  renderCard,
}) {
  const [activeCard, setActiveCard] = useState(null);
  const [overStageId, setOverStageId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Group cards by stage; cards without a stage go into an "Unsorted" bucket
  const stageIds = new Set(stages.map(s => Number(s.id)));
  const unsorted = cards.filter(c => !c.stage_id || !stageIds.has(Number(c.stage_id)));
  const cardsByStage = stages.reduce((acc, s) => {
    acc[s.id] = cards.filter((c) => Number(c.stage_id) === Number(s.id));
    return acc;
  }, {});
  const allStages = unsorted.length
    ? [{ id: '__unsorted', label: 'Unsorted', color: 'gray' }, ...stages]
    : stages;
  if (unsorted.length) cardsByStage['__unsorted'] = unsorted;

  const handleDragStart = ({ active }) => {
    setActiveCard(cards.find((c) => c.id === active.id) || null);
  };

  const handleDragOver = ({ over }) => {
    setOverStageId(over?.data?.current?.stageId ?? null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveCard(null);
    setOverStageId(null);
    if (!over) return;
    const targetStageId = over.data?.current?.stageId;
    // "Unsorted" is a holding lane for records without a stage, not a stage.
    if (targetStageId == null || targetStageId === '__unsorted') return;
    const card = cards.find((c) => c.id === active.id);
    if (card && Number(targetStageId) !== Number(card.stage_id)) {
      onCardMove?.(card.id, targetStageId);
    }
  };

  const handleDragCancel = () => {
    setActiveCard(null);
    setOverStageId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[300px]">
        {allStages.map((stage) => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            cards={cardsByStage[stage.id] || []}
            isOver={Number(overStageId) === Number(stage.id)}
            onCardClick={onCardClick}
            onCardEdit={onCardEdit}
            onAddCard={onAddCard}
            renderCard={renderCard}
            canMove={!!onCardMove}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeCard && (
          <div className="bg-white dark:bg-night-2 shadow-2xl rounded-lg border border-primary-300 p-3 w-64 rotate-1 cursor-grabbing opacity-95">
            {renderCard ? renderCard(activeCard) : <DefaultCardContent card={activeCard} />}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function PipelineColumn({ stage, cards, isOver, onCardClick, onCardEdit, onAddCard, renderCard, canMove }) {
  const { setNodeRef } = useDroppable({
    id: stage.id,
    data: { stageId: stage.id },
  });

  // The whole column is the drop target (header and padding included) — a card
  // released on the stage name used to be ignored.
  return (
    <div ref={setNodeRef} className={clsx('flex flex-col rounded-2xl p-3 min-w-[260px] w-[270px] flex-shrink-0 transition-all duration-150 border',
      isOver ? 'bg-primary-50/60 border-primary-200 dark:bg-primary-950/30 dark:border-primary-700' : 'bg-gray-50/80 dark:bg-white/[0.03] border-gray-100/80 dark:border-white/[0.07]')}>
      {/* Stage header */}
      <div className="flex items-center justify-between px-1.5 mb-2.5">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full flex-shrink-0"
            style={{ background: stage.color || 'rgb(var(--pc-500))' }}
          />
          <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">{stage.label}</span>
          <span className="text-[11px] text-gray-400 dark:text-gray-400 bg-white dark:bg-white/10 border border-gray-200/80 dark:border-white/[0.07] px-1.5 py-0.5 rounded-full font-medium">
            {cards.length}
          </span>
        </div>
        {onAddCard && (
          <button
            onClick={() => onAddCard(stage.id)}
            className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            title={`Add to ${stage.label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Cards */}
      <div
        className={clsx(
          'flex flex-col gap-2 flex-1 min-h-[100px] rounded-xl p-1.5 transition-all duration-150',
          isOver
            ? 'bg-primary-50/80 dark:bg-primary-950/40 ring-2 ring-inset ring-primary-200 dark:ring-primary-700'
            : 'bg-gray-50/70 dark:bg-transparent',
        )}
      >
        {cards.map((card) => (
          <PipelineCard
            key={card.id}
            card={card}
            onClick={() => onCardClick?.(card)}
            onEdit={() => onCardEdit?.(card)}
            renderCard={renderCard}
            showEditAction={!!onCardEdit}
            showActivityAction={!!onCardClick}
            canMove={canMove}
          />
        ))}

        {cards.length === 0 && (
          <div
            className={clsx(
              'rounded-xl border-2 border-dashed p-3.5 transition-colors',
              isOver
                ? 'border-primary-300 bg-primary-50/60 dark:bg-primary-950/20'
                : 'border-gray-200/80 dark:border-white/[0.08]',
            )}
          >
            <div className="flex items-start gap-2">
              <GripVertical className="h-3.5 w-3.5 mt-0.5 text-gray-200 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className={clsx('text-[13px] font-medium leading-snug', isOver ? 'text-primary-400' : 'text-gray-300 dark:text-gray-600')}>
                  {isOver ? '↓ Drop here' : 'Empty'}
                </p>
                <p className="text-[11px] text-gray-200 dark:text-gray-700 mt-1 truncate">—</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineCard({ card, onClick, onEdit, renderCard, showEditAction, showActivityAction, canMove }) {
  // Without onCardMove (e.g. a view-only role) the card must not lift at all —
  // it used to drag and silently snap back to its lane.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { stageId: card.stage_id },
    disabled: !canMove,
  });

  /** Prevent pointer events on action buttons from starting a drag */
  const stopDrag = (e) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'group bg-white dark:bg-night-2 rounded-xl border border-gray-100 dark:border-white/[0.07] shadow-xs p-3.5 select-none',
        'hover:shadow-card hover:-translate-y-0.5 transition-all duration-150',
        isDragging
          ? 'opacity-20 scale-95 cursor-grabbing'
          : canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
      title={canMove ? undefined : 'View only — you don\'t have permission to change stages'}
      onClick={isDragging ? undefined : onClick}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2">
        {canMove && <GripVertical className="h-3.5 w-3.5 mt-0.5 text-gray-200 flex-shrink-0" />}

        <div className="flex-1 min-w-0">
          {renderCard ? renderCard(card) : <DefaultCardContent card={card} />}
        </div>

        {/* Action buttons — visible on hover, never trigger drag */}
        {(showActivityAction || showEditAction) && (
          <div
            className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
            onPointerDown={stopDrag}
          >
            {showActivityAction && (
              <button
                title="View activity"
                onClick={(e) => { e.stopPropagation(); onClick?.(); }}
                onPointerDown={stopDrag}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-colors"
              >
                <Activity className="h-3 w-3" />
              </button>
            )}
            {showEditAction && (
              <button
                title="Edit record"
                onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                onPointerDown={stopDrag}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-colors"
              >
                <Edit className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DefaultCardContent({ card }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        {/* Two lines, not one: titles such as "Statement request · Corinne Henry" lose the distinguishing part when cut. */}
        <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200 line-clamp-2 break-words leading-snug">{card.title}</p>
        {card.badge && (
          <span
            className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white leading-none"
            style={{ background: card.badge.color || 'rgb(var(--n-500))' }}
            title={card.badge.title || undefined}
          >
            {card.badge.label}
          </span>
        )}
      </div>
      {card.subtitle && <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-1">{card.subtitle}</p>}
    </>
  );
}
