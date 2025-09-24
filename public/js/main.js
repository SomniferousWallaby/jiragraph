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

// --- Global Variables ---
let JIRA_URL, EMAIL, API_TOKEN, EPIC_KEY;
let currentGraphData = null;
let simulation = null; // Make simulation globally accessible
let zoom = null; // Make zoom behavior globally accessible


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
    epic_key_input = document.getElementById('epic-key').value.trim();
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

    fetchDataAndRender();
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
        renderGraph(currentGraphData);
    }
});

showGraphBtn.addEventListener('click', () => {
    setActiveView('graph');
    if (currentGraphData) {
        updateGraphSelection();
    }
});

showGanttBtn.addEventListener('click', () => {
    setActiveView('gantt');
    if (currentGraphData) {
        renderGanttChart(currentGraphData);
    }
});







