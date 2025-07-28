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
