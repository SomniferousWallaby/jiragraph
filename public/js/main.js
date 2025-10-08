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
const graphContainer = document.getElementById('graph-container');
const ganttContainer = document.getElementById('gantt-container');
const loader = document.getElementById('loader');
const placeholder = document.getElementById('placeholder');
const issueDetailsPanel = document.getElementById('issue-details');
const epicHeader = document.getElementById('epic-header');
const epicTitle = document.getElementById('epic-title');
const epicSummary = document.getElementById('epic-summary');

const velocityInput = document.getElementById('velocity');
const numDevsInput = document.getElementById('numDevs');
const estimateBtn = document.getElementById('estimate-btn');
const estimateOutput = document.getElementById('estimate-output');

// --- Global Variables ---
let JIRA_URL, EMAIL, API_TOKEN, EPIC_KEY;

// --- Callback Functions ---
let currentGraphData = null;
function handleCurrentGraphData(data) {
    currentGraphData = data;
}

let selectedNodeId = null;
function handleNodeSelect(nodeId) {
    selectedNodeId = nodeId;
    updateGraphSelection(currentGraphData, selectedNodeId);
}

let simulation = null;
function handleSimulation(sim) {
    simulation = sim;
}

let zoom = null;
function handleZoom(z) {
    zoom = z;
}


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

visualizeBtn.addEventListener('click', async () => {
    JIRA_URL = document.getElementById('jira-url').value.trim();
    EMAIL = document.getElementById('email').value.trim();
    API_TOKEN = document.getElementById('api-token').value.trim();
    let epic_key_input = document.getElementById('epic-key').value.trim();
    EPIC_KEY = epic_key_input.split(',').map(k => k.trim()).filter(k => k);

    if (!JIRA_URL || !EMAIL || !API_TOKEN || !EPIC_KEY) {
        alert('Please fill in all Jira configuration fields.');
        return;
    }

    if (JIRA_URL.endsWith('/')) {
        JIRA_URL = JIRA_URL.slice(0, -1);
    }

    const configToSave = { jiraUrl: JIRA_URL, email: EMAIL, epicKey: EPIC_KEY };
    localStorage.setItem('jiraConfig', JSON.stringify(configToSave));

    const graph = await fetchDataAndRender(
        JIRA_URL, EMAIL, API_TOKEN, EPIC_KEY,
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
    );
    handleCurrentGraphData(graph);
});

resetViewBtn.addEventListener('click', () => {
    // Check that the zoom behavior has been initialized
    if (currentGraphData && zoom) {
        const svg = d3.select("#graph-svg");
        const container = svg.select("g"); // Select the container group that holds the graph

        // 1. Visually transition the container back to the identity transform.
        if (!container.empty()) {
            container.transition().duration(750).attr('transform', d3.zoomIdentity);
        }

        // 2. Immediately update the zoom behavior's internal state to match.
        svg.call(zoom.transform, d3.zoomIdentity);

        if (simulation) {
            simulation.alpha(0.2).restart();
        }
    }
});

window.addEventListener('resize', () => {
    if (currentGraphData) {
        renderGraph(
            currentGraphData, 
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
        updateGraphSelection(currentGraphData, selectedNodeId);
    }
});

showGraphBtn.addEventListener('click', () => {
    setActiveView('graph', graphContainer, ganttContainer, showGraphBtn, showGanttBtn);
    if (currentGraphData) {
        updateGraphSelection(currentGraphData, selectedNodeId);
    }
});

showGanttBtn.addEventListener('click', () => {
    setActiveView('gantt', graphContainer, ganttContainer, showGraphBtn, showGanttBtn);
    if (currentGraphData) {
        renderGanttChart(
            currentGraphData, 
            JIRA_URL,
            handleNodeSelect, 
            selectedNodeId,
            issueDetailsPanel);
        updateGraphSelection(currentGraphData, selectedNodeId);
    }
});

estimateBtn.addEventListener('click', () => {
    if (!currentGraphData) {
        estimateOutput.textContent = "No data loaded.";
        return;
    }
    const velocity = Number(velocityInput.value) || 1;
    const numDevs = Number(numDevsInput.value) || 1;

    // Filter issues that are not Done
    const remainingIssues = currentGraphData.nodes.filter(n => n.statusCategory !== "Done");

    // Sum points for pointed issues
    const remainingPoints = remainingIssues
        .filter(n => n.storyPoints)
        .reduce((sum, n) => sum + n.storyPoints, 0);

    // Count unpointed issues
    const unpointedCount = remainingIssues.filter(n => !n.storyPoints).length;

    const teamVelocity = velocity * numDevs;
    const weeksLeft = teamVelocity > 0 ? (remainingPoints / teamVelocity) : 0;

    estimateOutput.textContent =
        `Estimated time remaining: ${weeksLeft.toFixed(1)} weeks (${remainingPoints} points left)` +
        (unpointedCount > 0 ? ` — ${unpointedCount} unpointed issue${unpointedCount > 1 ? 's' : ''}` : '');
});







