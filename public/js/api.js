// --- JIRA & D3 LOGIC ---

import { setActiveView } from "./state.js";
import { renderGraph } from "./graph.js";

export async function fetchDataAndRender(JIRA_URL, EMAIL, API_TOKEN, EPIC_KEY,
  handleNodeSelect,
  selectedNodeId,
  handleSimulation,
  simulation,
  handleZoom,
  zoom,
  graphContainer,
  ganttContainer,
  loader,
  placeholder,
  issueDetailsPanel,
  epicHeader,
  epicTitle,
  epicSummary,
  resetViewBtn,
  showGraphBtn,
  showGanttBtn
) {
    loader.classList.remove('hidden');
    placeholder.classList.add('hidden');
    issueDetailsPanel.classList.add('hidden');
    epicHeader.classList.add('hidden');
    resetViewBtn.classList.add('hidden');
    d3.select("#graph-svg").selectAll("*").remove();
    
    const ganttHeaderContainer = document.getElementById('gantt-header');
    const ganttRowsContainer = document.getElementById('gantt-rows');
    if(ganttHeaderContainer) ganttHeaderContainer.innerHTML = '';
    if(ganttRowsContainer) ganttRowsContainer.innerHTML = '';


    try {
        console.log('Fetching data with:', { JIRA_URL, EMAIL, API_TOKEN, EPIC_KEY });
        const response = await fetch('/api/jira', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jiraUrl: JIRA_URL, email: EMAIL, apiToken: API_TOKEN, epicKeys: EPIC_KEY })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Error response from server:", errorData);
            throw new Error(errorData.error || `Request failed: ${response.status}`);
        }

        const responseData = await response.json();
        const { epic, nodes, links } = processJiraData(responseData.issues, responseData.storyPointFieldId, EPIC_KEY);

        if (epic) {
            epicTitle.textContent = epic.id;
            epicSummary.textContent = epic.summary;
            epicHeader.classList.remove('hidden');
        }

        const graph = { nodes, links };
    
        if (graph.nodes.length > 0) {
            setActiveView('graph', graphContainer, ganttContainer, showGraphBtn, showGanttBtn);
            renderGraph(
              graph, 
              selectedNodeId, 
              graphContainer, 
              handleNodeSelect, 
              simulation, 
              handleSimulation,
              zoom,
              handleZoom,
              JIRA_URL,
              issueDetailsPanel
            );
            resetViewBtn.classList.remove('hidden');
        } else {
            placeholder.innerHTML = `<p class="text-xl font-medium text-red-500">No child issues found for Epic ${EPIC_KEY}.</p>`;
            placeholder.classList.remove('hidden');
        }
        return graph;

    } catch (error) {
        console.error('Error fetching from Jira:', error);
        placeholder.innerHTML = `<p class="text-xl font-medium text-red-500">Failed to fetch data.</p><p class="mt-2 text-sm">${error.message}</p>`;
        placeholder.classList.remove('hidden');
    } finally {
        loader.classList.add('hidden');
    }
}

/**
 * Processes Jira issue links to correctly handle all link types
 * and add an `isBlocking` flag for use in both views.
 */
function processJiraData(issues, storyPointFieldId, EPIC_KEY) {
    const epicKeys = Array.isArray(EPIC_KEY) ? EPIC_KEY : [EPIC_KEY];
    const epicIssues = issues.filter(issue => epicKeys.includes(issue.key));
    const childIssues = issues.filter(issue => !epicKeys.includes(issue.key));

    const nodes = childIssues.map(issue => ({
        id: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        statusCategory: issue.fields.status.statusCategory.name,
        type: issue.fields.issuetype.name,
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        storyPoints: (storyPointFieldId && issue.fields[storyPointFieldId]) ? issue.fields[storyPointFieldId] : 0,
        epic: issue.fields.parent ? issue.fields.parent.key : (issue.fields['Epic Link'] || null)
    }));

    const links = [];
    const processedLinks = new Set(); // Use a set to track processed pairs and prevent duplicates

    childIssues.forEach(issue => {
        if (issue.fields.issuelinks) {
            issue.fields.issuelinks.forEach(link => {
                let sourceId, targetId, linkType;
                let isBlocking = false;

                // Case 1: The current issue is the source of an outward link
                if (link.outwardIssue) {
                    sourceId = issue.key;
                    targetId = link.outwardIssue.key;
                    linkType = link.type.outward;
                    if (link.type.outward.toLowerCase().trim() === 'blocks') {
                        isBlocking = true;
                    }
                } 
                // Case 2: The current issue is the target of an inward link
                else if (link.inwardIssue) {
                    sourceId = link.inwardIssue.key;
                    targetId = issue.key;
                    linkType = link.type.outward; // Always use the outward description for consistency
                    if (link.type.inward.toLowerCase().trim() === 'is blocked by') {
                        isBlocking = true;
                    }
                } else {
                    return; // Skip if link is malformed
                }

                // Create a canonical key by sorting the IDs to handle duplicates
                const canonicalKey = [sourceId, targetId].sort().join('--');
                if (processedLinks.has(canonicalKey)) {
                    return; // We've already processed this relationship from the other issue
                }

                // Ensure both linked issues are part of this epic's children.
                if (!nodes.some(n => n.id === sourceId) || !nodes.some(n => n.id === targetId)) {
                    return;
                }

                processedLinks.add(canonicalKey);
                
                links.push({
                    source: sourceId,
                    target: targetId,
                    type: linkType, 
                    isBlocking: isBlocking
                });
            });
        }
    });

    return {
        epic: epicIssues.length === 1 ? { id: epicIssues[0].key, summary: epicIssues[0].fields.summary } : null,
        nodes,
        links
    };
}