
const ganttContainer = document.getElementById('gantt-container');

/**
 * Manages the active view (graph or gantt) and button styles.
 * @param {'graph' | 'gantt'} activeView - The view to make active.
 */
export function setActiveView(activeView) {
    const ganttHeaderContainer = document.getElementById('gantt-header');
    const ganttRowsContainer = document.getElementById('gantt-rows');

    if (activeView === 'graph') {
        ganttContainer.classList.add('hidden');
        if (ganttHeaderContainer) ganttHeaderContainer.innerHTML = '';
        if (ganttRowsContainer) ganttRowsContainer.innerHTML = '';
        
        graphContainer.classList.remove('hidden');
        
        showGraphBtn.classList.remove('bg-white', 'text-gray-900', 'border-gray-200', 'focus:ring-0');
        showGraphBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
        
        showGanttBtn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
        showGanttBtn.classList.add('bg-white', 'text-gray-900', 'border-gray-200', 'focus:ring-0');

    } else if (activeView === 'gantt') {
        graphContainer.classList.add('hidden');
        ganttContainer.classList.remove('hidden');
        
        showGanttBtn.classList.remove('bg-white', 'text-gray-900', 'border-gray-200', 'focus:ring-0');
        showGanttBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');

        showGraphBtn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
        showGraphBtn.classList.add('bg-white', 'text-gray-900', 'border-gray-200', 'focus:ring-0');
    }
}



