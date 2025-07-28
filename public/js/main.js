// main.js

// --- DOM Elements ---
const visualizeBtn = document.getElementById('visualize-btn');
const loader = document.getElementById('loader');
const graphContainer = document.getElementById('graph-container');
const placeholder = document.getElementById('placeholder');
const issueDetailsPanel = document.getElementById('issue-details');
const epicHeader = document.getElementById('epic-header');
const epicTitle = document.getElementById('epic-title');
const epicSummary = document.getElementById('epic-summary');
const resetViewBtn = document.getElementById('reset-view-btn');
const showGraphBtn = document.getElementById('show-graph-btn');
const showGanttBtn = document.getElementById('show-gantt-btn');
const ganttContainer = document.getElementById('gantt-container');


// --- Global Variables ---
let JIRA_URL, EMAIL, API_TOKEN, EPIC_KEY;
let currentGraphData = null;

// --- STATUS COLOR MAPPING ---
const statusColors = {
    'To Do': '#4B5563',
    'In Progress': '#3B82F6',
    'Done': '#10B981',
    'default': '#A1A1AA'
};

// --- EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    try {
        const savedConfig = JSON.parse(localStorage.getItem('jiraConfig'));
        if (savedConfig) {
            document.getElementById('jira-url').value = savedConfig.jiraUrl || '';
            document.getElementById('email').value = savedConfig.email || '';
            document.getElementById('epic-key').value = savedConfig.epicKey || '';
        }
    } catch (e) {
        console.error("Could not load config from localStorage", e);
    }
});

visualizeBtn.addEventListener('click', () => {
    JIRA_URL = document.getElementById('jira-url').value.trim();
    EMAIL = document.getElementById('email').value.trim();
    API_TOKEN = document.getElementById('api-token').value.trim();
    EPIC_KEY = document.getElementById('epic-key').value.trim();

    if (!JIRA_URL || !EMAIL || !API_TOKEN || !EPIC_KEY) {
        alert('Please fill in all Jira configuration fields.');
        return;
    }

    if (JIRA_URL.endsWith('/')) {
        JIRA_URL = JIRA_URL.slice(0, -1);
    }

    const configToSave = { jiraUrl: JIRA_URL, email: EMAIL, epicKey: EPIC_KEY };
    localStorage.setItem('jiraConfig', JSON.stringify(configToSave));

    fetchDataAndRender();
});

resetViewBtn.addEventListener('click', () => {
    if (currentGraphData) {
        const svg = d3.select("#graph-svg");
        svg.transition().duration(750).call(
            d3.zoom().transform, 
            d3.zoomIdentity
        );
        setTimeout(() => {
             renderGraph(currentGraphData);
        }, 750);
    }
});

window.addEventListener('resize', () => {
    if (currentGraphData) {
        renderGraph(currentGraphData);
    }
});

showGraphBtn.addEventListener('click', () => {
    setActiveView('graph');
});

showGanttBtn.addEventListener('click', () => {
    setActiveView('gantt');
    if (currentGraphData) {
        renderGanttChart(currentGraphData);
    }
});

/**
 * Manages the active view (graph or gantt) and button styles.
 * @param {'graph' | 'gantt'} activeView - The view to make active.
 */
function setActiveView(activeView) {
    if (activeView === 'graph') {
        ganttContainer.classList.add('hidden');
        graphContainer.classList.remove('hidden');
        // Style graph button as active
        showGraphBtn.classList.remove('bg-white', 'text-gray-900', 'border-gray-200');
        showGraphBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
        // Style gantt button as inactive
        showGanttBtn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
        showGanttBtn.classList.add('bg-white', 'text-gray-900', 'border-gray-200');
    } else if (activeView === 'gantt') {
        graphContainer.classList.add('hidden');
        ganttContainer.classList.remove('hidden');
        // Style gantt button as active
        showGanttBtn.classList.remove('bg-white', 'text-gray-900', 'border-gray-200');
        showGanttBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
        // Style graph button as inactive
        showGraphBtn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
        showGraphBtn.classList.add('bg-white', 'text-gray-900', 'border-gray-200');
    }
}

// --- JIRA & D3 LOGIC ---

async function fetchDataAndRender() {
    loader.classList.remove('hidden');
    placeholder.classList.add('hidden');
    issueDetailsPanel.classList.add('hidden');
    epicHeader.classList.add('hidden');
    resetViewBtn.classList.add('hidden');
    d3.select("#graph-svg").selectAll("*").remove();

    try {
        const response = await fetch('/api/jira', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jiraUrl: JIRA_URL, email: EMAIL, apiToken: API_TOKEN, epicKey: EPIC_KEY })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed: ${response.status}`);
        }

        const responseData = await response.json();

        const { epic, nodes, links } = processJiraData(responseData.issues, responseData.storyPointFieldId);

        if (epic) {
            epicTitle.textContent = epic.id;
            epicSummary.textContent = epic.summary;
            epicHeader.classList.remove('hidden');
        }

        const graph = { nodes, links };
        currentGraphData = graph;

        if (graph.nodes.length > 0) {
            setActiveView('graph')
            renderGraph(graph);
            resetViewBtn.classList.remove('hidden');
        } else {
            placeholder.innerHTML = `<p class="text-xl font-medium text-red-500">No child issues found for Epic ${EPIC_KEY}.</p>`;
            placeholder.classList.remove('hidden');
            epicHeader.classList.add('hidden');
            currentGraphData = null;
        }

    } catch (error) {
        console.error('Error fetching from Jira:', error);
        placeholder.innerHTML = `<p class="text-xl font-medium text-red-500">Failed to fetch data.</p><p class="mt-2 text-sm">${error.message}</p>`;
        placeholder.classList.remove('hidden');
        currentGraphData = null;
    } finally {
        loader.classList.add('hidden');
    }
}


/**
 * Processes Jira issue links to prevent duplicates.
 */
function processJiraData(issues, storyPointFieldId) {
    const epicIssue = issues.find(issue => issue.key === EPIC_KEY);
    const childIssues = issues.filter(issue => issue.key !== EPIC_KEY);

    const nodes = childIssues.map(issue => ({
        id: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        statusCategory: issue.fields.status.statusCategory.name,
        type: issue.fields.issuetype.name,
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        storyPoints: (storyPointFieldId && issue.fields[storyPointFieldId]) ? issue.fields[storyPointFieldId] : 0
    }));

    const links = [];
    childIssues.forEach(issue => {
        if (issue.fields.issuelinks) {
            issue.fields.issuelinks.forEach(link => {
                // We only process OUTWARD links to ensure each relationship is created only once.
                if (link.outwardIssue) {
                    // Check that the linked issue is actually one of the nodes in our graph.
                    const targetExists = nodes.some(n => n.id === link.outwardIssue.key);
                    if (targetExists) {
                        links.push({
                            source: issue.key,
                            target: link.outwardIssue.key,
                            type: link.type.outward // e.g., "Blocks"
                        });
                    }
                }
            });
        }
    });

    return {
        epic: epicIssue ? { id: epicIssue.key, summary: epicIssue.fields.summary } : null,
        nodes,
        links: links
    };
}


function renderGraph(graph) {
    const width = graphContainer.clientWidth;
    const height = graphContainer.clientHeight;
    const svg = d3.select("#graph-svg").attr("viewBox", [0, 0, width, height]);
    svg.selectAll("*").remove();

    const container = svg.append("g");

    const maxStoryPoints = d3.max(graph.nodes, d => d.storyPoints) || 1;
    const radiusScale = d3.scaleSqrt()
        .domain([0, maxStoryPoints])
        .range([8, 25]);

    // Specific marker for blocking relationships.
    container.append("defs").append("marker")
        .attr("id", "arrow-blocking") 
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 15)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto-start-reverse")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#EF4444"); // Red color (Tailwind red-500)

    const simulation = d3.forceSimulation(graph.nodes)
        .force("link", d3.forceLink(graph.links).id(d => d.id).distance(140))
        .force("charge", d3.forceManyBody().strength(-50))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => radiusScale(d.storyPoints) + 3));

    // Conditionally style the links and apply the correct marker.
    const link = container.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(graph.links)
        .join("line")
        .style("stroke", d => { // Set stroke color based on type
            if (d.type.toLowerCase().trim() === 'blocks') {
                return "#EF4444"; // Red for blocking
            }
            return "#9ca3af"; // Default gray
        })
        .style("stroke-opacity", 0.8)
        .attr("marker-end", d => { // Apply marker based on type
            if (d.type.toLowerCase().trim() === 'blocks') {
                return "url(#arrow-blocking)"; // Use the new red marker
            }
            return null;
        });

    const linkLabelGroup = container.append("g")
        .attr("class", "link-labels")
        .selectAll("g")
        .data(graph.links)
        .join("g");

    const linkLabelText = linkLabelGroup.append("text")
        .text(d => d.type)
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .style("font-size", "8px")
        .style("fill", "#374151");

    linkLabelGroup.insert("rect", "text")
        .attr("fill", "#f9fafb")
        .attr("rx", 3)
        .each(function(d) {
            const textNode = this.parentNode.querySelector('text');
            if (textNode) {
                const bbox = textNode.getBBox();
                d3.select(this)
                    .attr("x", bbox.x - 4)
                    .attr("y", bbox.y - 2)
                    .attr("width", bbox.width + 8)
                    .attr("height", bbox.height + 4);
            }
        });

    const blockedNodeIds = new Set(
        graph.links
            .filter(link => link.type.toLowerCase().trim() === 'blocks')
            .map(link => link.target.id || link.target)
    );

    const node = container.append("g").attr("class", "nodes").selectAll("g")
        .data(graph.nodes).join("g").call(drag(simulation));

    node.append("circle")
        .attr("r", d => radiusScale(d.storyPoints))
        .attr("fill", d => statusColors[d.statusCategory] || statusColors.default)
        .attr("stroke", d => !blockedNodeIds.has(d.id) ? '#22C55E' : '#E5E7EB')
        .attr("stroke-width", d => !blockedNodeIds.has(d.id) ? 3 : 1.5)
        .on("click", (event, d) => {
            updateIssueDetails(d);
            node.selectAll("circle")
                .attr("stroke", n => !blockedNodeIds.has(n.id) ? '#22C55E' : '#E5E7EB')
                .attr("stroke-width", n => !blockedNodeIds.has(n.id) ? 3 : 1.5);
            d3.select(event.currentTarget).attr("stroke", "#3B82F6").attr("stroke-width", 3);
        });

    node.append("text")
        .text(d => d.id)
        .attr("y", d => radiusScale(d.storyPoints) + 10);

    simulation.on("tick", () => {
        link.attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const targetRadius = radiusScale(d.target.storyPoints || 0);
                return d.target.x - (dx / distance) * (targetRadius + 2); // +2 for padding
            })
            .attr("y2", d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const targetRadius = radiusScale(d.target.storyPoints || 0);
                return d.target.y - (dy / distance) * (targetRadius + 2); // +2 for padding
            });


        node.attr("transform", d => `translate(${d.x},${d.y})`);

        linkLabelGroup.attr("transform", d => {
            const x = d.source.x + 0.50 * (d.target.x - d.source.x);
            const y = d.source.y + 0.50 * (d.target.y - d.source.y);
            return `translate(${x},${y})`;
        });
    });

    const zoom = d3.zoom().scaleExtent([0.1, 4]).on("zoom", (event) => {
        container.attr('transform', event.transform);
    });
    svg.call(zoom);
}

function updateIssueDetails(d) {
    document.getElementById('detail-key').textContent = d.id;
    document.getElementById('detail-summary').textContent = d.summary;
    const statusBadge = document.getElementById('detail-status-badge');
    statusBadge.textContent = d.status;
    const color = statusColors[d.statusCategory] || statusColors.default;
    const textClass = (parseInt(color.substring(1), 16) > 0xffffff / 2) ? 'text-gray-800' : 'text-white';
    statusBadge.style.backgroundColor = color;
    statusBadge.className = `px-2 py-1 text-xs font-semibold rounded-full ${textClass}`;
    document.getElementById('detail-assignee').textContent = d.assignee;
    document.getElementById('detail-points').textContent = d.storyPoints > 0 ? `${d.storyPoints} points` : 'Not pointed';
    document.getElementById('detail-type').textContent = d.type;
    document.getElementById('detail-link').href = `${JIRA_URL}/browse/${d.id}`;
    issueDetailsPanel.classList.remove('hidden');
}

function drag(simulation) {
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.1).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

/**
 * Calculates the dependency level for each task using topological sort.
 * Returns a map of nodeId -> level.
 */
function calculateTaskLevels(nodes, links) {
    const levels = new Map();
    const inDegree = new Map(nodes.map(n => [n.id, 0]));
    const adj = new Map(nodes.map(n => [n.id, []]));

    // Build the graph representation
    links.forEach(link => {
        if (link.type.toLowerCase().trim() === 'blocks') {
            const source = link.source.id || link.source;
            const target = link.target.id || link.target;
            adj.get(source).push(target);
            inDegree.set(target, (inDegree.get(target) || 0) + 1);
        }
    });

    // Find all starting nodes (in-degree is 0)
    const queue = [];
    for (const [nodeId, degree] of inDegree.entries()) {
        if (degree === 0) {
            queue.push(nodeId);
            levels.set(nodeId, 0);
        }
    }

    let head = 0;
    while (head < queue.length) {
        const u = queue[head++];
        const currentLevel = levels.get(u);

        for (const v of (adj.get(u) || [])) {
            inDegree.set(v, inDegree.get(v) - 1);
            // Set the level of the dependent task to be one greater
            levels.set(v, Math.max(levels.get(v) || 0, currentLevel + 1));
            if (inDegree.get(v) === 0) {
                queue.push(v);
            }
        }
    }
    return levels;
}

/**
 * Calculates the start and end times for each task based on dependencies.
 */
function calculateTaskTimes(nodes, links) {
    // A map to store the start, end, and duration for each task
    const times = new Map(nodes.map(n => [n.id, {
        start: 0,
        end: 0,
        duration: Math.max(1, n.storyPoints || 1) // Duration is based on story points
    }]));

    // Maps to build a graph representation for sorting
    const inDegree = new Map(nodes.map(n => [n.id, 0]));
    const adj = new Map(nodes.map(n => [n.id, []]));

    // Build the graph from "Blocks" links
    links.forEach(link => {
        if (link.type.toLowerCase().trim() === 'blocks') {
            const source = link.source.id || link.source; // The task that blocks
            const target = link.target.id || link.target; // The task that is blocked
            adj.get(source).push(target);
            inDegree.set(target, (inDegree.get(target) || 0) + 1);
        }
    });

    // Find all starting tasks (those with no prerequisites)
    const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);

    // Process the queue
    let head = 0;
    while (head < queue.length) {
        const u_id = queue[head++];
        const u_task = times.get(u_id);

        // This task's end time is its start time plus its duration
        u_task.end = u_task.start + u_task.duration;

        // For every task that this one blocks...
        for (const v_id of (adj.get(u_id) || [])) {
            const v_task = times.get(v_id);
            // ...its start time must be at least the end time of the current task
            v_task.start = Math.max(v_task.start, u_task.end);

            inDegree.set(v_id, inDegree.get(v_id) - 1);
            if (inDegree.get(v_id) === 0) {
                queue.push(v_id);
            }
        }
    }
    return times;
}

/**
 * Renders a Gantt chart based on calculated task start/end times.
 */
function renderGanttChart(data) {
    ganttContainer.innerHTML = '';
    const taskTimes = calculateTaskTimes(data.nodes, data.links);
    
    // Find the total duration of the project to set the scale
    let maxTime = 0;
    for (const task of taskTimes.values()) {
        if (task.end > maxTime) maxTime = task.end;
    }
    const scaleEnd = maxTime;

    // Sort the tasks by their start time
    const ganttRows = data.nodes
        .sort((a, b) => (taskTimes.get(a.id)?.start || 0) - (taskTimes.get(b.id)?.start || 0))
        .map(node => {
            const times = taskTimes.get(node.id);
            if (!times || !scaleEnd) return '';

            // Calculate the position and width using the accurate timeline scale
            const leftPercent = (times.start / scaleEnd) * 100;
            const widthPercent = (times.duration / scaleEnd) * 100;
        
            return `
                <div class="flex items-center p-2 border-b border-gray-200 text-sm">
                    <div class="w-1/3 truncate" title="${node.summary}">
                        <span class="font-mono text-xs text-gray-500">${node.id}</span>
                        <span class="ml-2">${node.summary}</span>
                    </div>
                    <div class="w-2/3 relative h-6 bg-gray-200 rounded">
                        <div class="absolute h-6 rounded text-white text-xs flex items-center justify-center overflow-hidden" 
                             title="${node.storyPoints || 1} points"
                             style="background-color: ${statusColors[node.statusCategory] || statusColors.default}; 
                                    left: ${leftPercent}%; 
                                    width: ${widthPercent}%;">
                             <span class="px-1">${node.storyPoints || 'n/a'}</span>
                        </div>
                    </div>
                </div>
            `;
    }).join('');

    // --- HEADER LOGIC ---
    let headerLevels = '';
    if (scaleEnd > 0) {
        // Determine a smart tick increment to avoid clutter
        let increment = 1;
        if (scaleEnd > 50) {
            increment = 10;
        } else if (scaleEnd > 20) {
            increment = 5;
        } else if (scaleEnd > 10) {
            increment = 2;
        }

        // Create a tick mark at each increment
        for (let i = increment; i <= scaleEnd; i += increment) {
            const position = (i / scaleEnd) * 100;
            headerLevels += `
                <div class="absolute h-full top-0" style="left: ${position}%;">
                    <div class="w-px h-2 bg-gray-300"></div>
                    <div class="absolute -top-4 text-xs text-gray-500" style="transform: translateX(-50%);">${i}</div>
                </div>
            `;
        }
    }

    ganttContainer.innerHTML = `
        <div class="p-4">
            <div class="flex items-center border-b-2 pb-2 mb-4">
                <div class="w-1/3 font-bold">Task</div>
                <div class="w-2/3 relative h-1">
                    <div class="absolute -top-4 left-0 text-xs text-gray-500">0</div>
                    ${headerLevels}
                </div>
            </div>
            ${ganttRows}
        </div>
    `;
}