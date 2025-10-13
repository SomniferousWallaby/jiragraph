// main.js
import { renderGanttChart } from './gantt.js'
import { renderGraph, updateGraphSelection } from './graph.js';
import { setActiveView } from './state.js';
import { fetchDataAndRender } from './api.js';

// --- DOM Elements ---
const visualizeBtn = document.getElementById('visualize-btn');
const resetViewBtn = document.getElementById('reset-view-btn');
const showGraphBtn = document.getElementById('show-graph-btn');
const showGanttBtn = document.getElementById('show-gantt-btn');
const showEstimateBtn = document.getElementById('show-estimate-btn');

const graphContainer = document.getElementById('graph-container');
const ganttContainer = document.getElementById('gantt-container');
const estimateContainer = document.getElementById('estimate-container');

const loader = document.getElementById('loader');
const placeholder = document.getElementById('placeholder');
const issueDetailsPanel = document.getElementById('issue-details');

const epicHeader = document.getElementById('epic-header');
const epicTitle = document.getElementById('epic-title');
const epicSummary = document.getElementById('epic-summary');
const epicStatsContainer = document.getElementById('epic-stats-container');
const epicPercentComplete = document.getElementById('epic-percent-complete');
const epicPointsSummary = document.getElementById('epic-points-summary'); 
const estimateBtn = document.getElementById('estimate-btn');
const estimateOutput = document.getElementById('estimate-output');
const devListContainer = document.getElementById('developer-list-container');
const refreshDevsBtn = document.getElementById('refresh-devs-btn');

// --- Global Variables ---
let JIRA_URL, EMAIL, API_TOKEN, EPIC_KEY;
let currentGraphData = null;
let selectedNodeId = null;
let simulation = null;
let zoom = null;
let devs = [];

// --- Callback Functions ---
function handleCurrentGraphData(data) { 
    currentGraphData = data; 
    updateEpicStats();
}
function handleNodeSelect(nodeId) { selectedNodeId = nodeId; updateGraphSelection(currentGraphData, selectedNodeId); }
function handleSimulation(sim) { simulation = sim; }
function handleZoom(z) { zoom = z; }


function updateEpicStats() {
    if (!currentGraphData || !currentGraphData.nodes) {
        epicStatsContainer.classList.add('hidden');
        return;
    }

    const completedPoints = currentGraphData.nodes
        .filter(n => n.statusCategory === "Done" && n.storyPoints)
        .reduce((sum, n) => sum + n.storyPoints, 0);
    
    const totalPoints = currentGraphData.nodes
        .filter(n => n.storyPoints)
        .reduce((sum, n) => sum + n.storyPoints, 0);

    const percentComplete = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;

    epicPercentComplete.textContent = `${percentComplete.toFixed(0)}% Complete`;
    epicPointsSummary.textContent = `${completedPoints} / ${totalPoints} points`;
    epicStatsContainer.classList.remove('hidden');
}


// --- Developer Data Functions ---
async function fetchDevelopers() {
    if (!JIRA_URL || !EMAIL || !API_TOKEN) {
        console.warn("Cannot fetch developers, Jira credentials are not set.");
        return [];
    }
    try {
        const response = await fetch('/api/developers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jiraUrl: JIRA_URL, email: EMAIL, apiToken: API_TOKEN })
        });
        if (!response.ok) {
            console.error('Failed to fetch developers:', response.statusText);
            return [];
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching developers:', error);
        return [];
    }
}

function renderDeveloperList(devList) {
    if (!devListContainer) return;
    if (devList.length === 0) {
        devListContainer.innerHTML = `<p class="text-gray-500 text-center">No developer data found. Click 'Refresh List' or check credentials.</p>`;
        return;
    }
    devListContainer.innerHTML = devList.map(dev => {
        const weeklyVelocity = (dev.velocity / 4).toFixed(1);
        return `
            <div class="flex items-center justify-between space-x-2 p-2 rounded-md hover:bg-gray-50">
                <div class="flex items-center flex-grow">
                    <input type="checkbox" id="dev-${dev.accountId}" data-account-id="${dev.accountId}" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                    <label for="dev-${dev.accountId}" class="ml-3 text-sm text-gray-800">
                        ${dev.name} <span class="text-gray-500">(${weeklyVelocity} pts/wk)</span>
                    </label>
                </div>
                <div class="flex items-center space-x-2">
                    <input type="number" data-account-id="${dev.accountId}" value="100" min="0" max="100" class="w-20 text-right border-gray-300 rounded-md shadow-sm sm:text-sm focus:ring-indigo-500 focus:border-indigo-500">
                    <span class="text-sm text-gray-500">%</span>
                </div>
            </div>
        `;
    }).join('');
}

async function loadDevelopers() {
    devs = await fetchDevelopers();
    renderDeveloperList(devs);
}

function renderEstimationView() {
    if (!currentGraphData || !currentGraphData.nodes) {
        estimateOutput.innerHTML = `<span class="text-gray-500">Graph data not loaded yet.</span>`;
        return;
    }
    const checkedBoxes = document.querySelectorAll('#developer-list-container input[type="checkbox"]:checked');
    if (checkedBoxes.length === 0) {
        estimateOutput.innerHTML = `<span class="text-gray-500">Please select at least one developer to see an estimate.</span>`;
        return;
    }
    
    let teamWeeklyVelocity = 0;
    checkedBoxes.forEach(checkbox => {
        const accountId = checkbox.dataset.accountId;
        const dev = devs.find(d => d.accountId === accountId);
        const allocationInput = document.querySelector(`#developer-list-container input[type="number"][data-account-id="${accountId}"]`);
        const allocationPercent = Number(allocationInput.value) || 100;
        if (dev) {
            const devWeeklyVelocity = dev.velocity / 4.3; // Approx. 4.3 weeks per month
            const allocatedVelocity = devWeeklyVelocity * (allocationPercent / 100);
            teamWeeklyVelocity += allocatedVelocity;
        }
    });

    const remainingIssues = currentGraphData.nodes.filter(n => n.statusCategory !== "Done");
    const remainingPoints = remainingIssues
        .filter(n => n.storyPoints)
        .reduce((sum, n) => sum + n.storyPoints, 0);

    const unpointedCount = remainingIssues.filter(n => !n.storyPoints).length;
    const weeksLeft = teamWeeklyVelocity > 0 ? (remainingPoints / teamWeeklyVelocity) : 0;

    let output = `Est. Time: ${weeksLeft.toFixed(1)} weeks (${remainingPoints} points left)`;
    if (unpointedCount > 0) {
        output += ` <span class="text-gray-600 font-medium">— with ${unpointedCount} unpointed issue${unpointedCount > 1 ? 's' : ''}.</span>`;
    }
    estimateOutput.innerHTML = output;
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const savedConfig = JSON.parse(localStorage.getItem('jiraConfig'));
        if (savedConfig) {
            document.getElementById('jira-url').value = savedConfig.jiraUrl || '';
            document.getElementById('email').value = savedConfig.email || '';
            document.getElementById('epic-key').value = savedConfig.epicKey || '';
            JIRA_URL = savedConfig.jiraUrl;
            EMAIL = savedConfig.email;
            API_TOKEN = document.getElementById('api-token').value.trim();
            if (API_TOKEN) {
                await loadDevelopers();
            }
        }
    } catch (e) { console.error("Could not load config from localStorage", e); }
});

visualizeBtn.addEventListener('click', async () => {
    JIRA_URL = document.getElementById('jira-url').value.trim();
    EMAIL = document.getElementById('email').value.trim();
    API_TOKEN = document.getElementById('api-token').value.trim();
    let epic_key_input = document.getElementById('epic-key').value.trim();
    EPIC_KEY = epic_key_input.split(',').map(k => k.trim()).filter(k => k);

    if (!JIRA_URL || !EMAIL || !API_TOKEN || !EPIC_KEY.length) {
        alert('Please fill in all Jira configuration fields.');
        return;
    }
    if (JIRA_URL.endsWith('/')) { JIRA_URL = JIRA_URL.slice(0, -1); }

    const configToSave = { jiraUrl: JIRA_URL, email: EMAIL, epicKey: epic_key_input };
    localStorage.setItem('jiraConfig', JSON.stringify(configToSave));
    await loadDevelopers();

    const graph = await fetchDataAndRender(
        JIRA_URL, EMAIL, API_TOKEN, EPIC_KEY,
        handleNodeSelect, selectedNodeId, handleSimulation, simulation,
        handleZoom, zoom, graphContainer, ganttContainer, estimateContainer,
        loader, placeholder, issueDetailsPanel, epicHeader, epicTitle,
        epicSummary, resetViewBtn, showGraphBtn, showGanttBtn, showEstimateBtn
    );
    handleCurrentGraphData(graph);
});

refreshDevsBtn.addEventListener('click', loadDevelopers);
estimateBtn.addEventListener('click', renderEstimationView);

// --- VIEW LOGIC ---
resetViewBtn.addEventListener('click', () => {
    if (currentGraphData && zoom) {
        const svg = d3.select("#graph-svg");
        const container = svg.select("g");
        if (!container.empty()) {
            container.transition().duration(750).attr('transform', d3.zoomIdentity);
        }
        svg.call(zoom.transform, d3.zoomIdentity);
        if (simulation) { simulation.alpha(0.3).restart(); }
    }
});

window.addEventListener('resize', () => {
    if (currentGraphData) {
        renderGraph(
            currentGraphData, selectedNodeId, graphContainer, handleNodeSelect,
            simulation, handleSimulation, zoom, handleZoom, JIRA_URL, issueDetailsPanel
        );
        updateGraphSelection(currentGraphData, selectedNodeId);
    }
});

showGraphBtn.addEventListener('click', () => {
    setActiveView('graph', graphContainer, ganttContainer, estimateContainer, showGraphBtn, showGanttBtn, showEstimateBtn);
    if (currentGraphData) {
        updateGraphSelection(currentGraphData, selectedNodeId);
    }
});

showGanttBtn.addEventListener('click', () => {
    setActiveView('gantt', graphContainer, ganttContainer, estimateContainer, showGraphBtn, showGanttBtn, showEstimateBtn);
    if (currentGraphData) {
        renderGanttChart(
            currentGraphData, JIRA_URL, handleNodeSelect,
            selectedNodeId, issueDetailsPanel
        );
        updateGraphSelection(currentGraphData, selectedNodeId);
    }
});

showEstimateBtn.addEventListener('click', () => {
    setActiveView('estimate', graphContainer, ganttContainer, estimateContainer, showGraphBtn, showGanttBtn, showEstimateBtn);
    renderEstimationView();
});