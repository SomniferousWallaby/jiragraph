
const ganttContainer = document.getElementById('gantt-container');

/**
 * Manages the active view (graph or gantt) and button styles.
 * @param {'graph' | 'gantt' | 'estimate'} activeView - The view to make active.
 */
export function setActiveView(
    activeView, 
    graphContainer, 
    ganttContainer, 
    estimateContainer, 
    showGraphBtn, 
    showGanttBtn, 
    showEstimateBtn
) {
    const views = {
        graph: { container: graphContainer, btn: showGraphBtn },
        gantt: { container: ganttContainer, btn: showGanttBtn },
        estimate: { container: estimateContainer, btn: showEstimateBtn }
    };

    const activeClasses = ['bg-indigo-600', 'text-white', 'border-indigo-600'];
    const inactiveClasses = ['bg-white', 'text-gray-900', 'border-gray-200'];

    for (const viewName in views) {
        const view = views[viewName];
        view.container.classList.add('hidden');
        view.btn.classList.remove(...activeClasses);
        view.btn.classList.add(...inactiveClasses);
    }
    
    const currentView = views[activeView];
    if (currentView) {
        currentView.container.classList.remove('hidden');
        currentView.btn.classList.remove(...inactiveClasses);
        currentView.btn.classList.add(...activeClasses);
    }

    if (activeView !== 'gantt') {
        const ganttHeaderContainer = document.getElementById('gantt-header');
        const ganttRowsContainer = document.getElementById('gantt-rows');
        if (ganttHeaderContainer) ganttHeaderContainer.innerHTML = '';
        if (ganttRowsContainer) ganttRowsContainer.innerHTML = '';
    }
}


