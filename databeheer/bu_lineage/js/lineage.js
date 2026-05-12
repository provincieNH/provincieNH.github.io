async function loadLineage() {
  const response = await fetch("openlineage_events.json");
  const events = await response.json();

  const nodes = new Map();
  const edges = [];

  function medailleKleur(medaille) {
    if (!medaille) return "#FFFFFF";
    const m = medaille.toLowerCase();
    if (m === "goud") return "#D4AF37";
    if (m === "zilver") return "#C0C0C0";
    if (m === "brons") return "#CD7F32";
    return "#1565c0";
  }

  function addNode(id, label, type, meta = {}) {
    if (!nodes.has(id)) {
      const medaille = meta.dataset_medaille;
      const borderColor = medailleKleur(medaille);

      nodes.set(id, {
        data: {
          id,
          label,
          type,
          meta,
          borderColor,
          borderWidth: type === "dataset" ? 4 : 1
        }
      });
    }
  }

  events.forEach(event => {

    const jobMeta = event.job.facets?.metadata?.meta || {};
    const jobId = "job:" + event.job.name;
    const jobLabel = jobMeta.job_naam || event.job.name;

    addNode(jobId, jobLabel, "job", jobMeta);

    (event.inputs || []).forEach(input => {
      const dsId = "ds:" + input.namespace + "." + input.name;
      const dsMeta = input.facets?.metadata?.meta || {};
      const dsLabel = dsMeta?.dataset_naam || input.name.split("__")[0];

      addNode(dsId, dsLabel, "dataset", dsMeta);

      edges.push({
        data: { source: dsId, target: jobId }
      });
    });

    (event.outputs || []).forEach(output => {
      const dsId = "ds:" + output.namespace + "." + output.name;
      const dsMeta = output.facets?.metadata?.meta || {};
      const dsLabel = dsMeta?.dataset_naam || output.name.split("__")[0];

      addNode(dsId, dsLabel, "dataset", dsMeta);

      edges.push({
        data: { source: jobId, target: dsId }
      });
    });

  });

  const cy = cytoscape({
    container: document.getElementById("lineage"),
    elements: [...nodes.values(), ...edges],

    layout: {
      name: "dagre",
      rankDir: "LR",
      nodeSep: 80,
      edgeSep: 40,
      rankSep: 140,
      padding: 40
    },

    style: [
      {
        selector: "node",
        style: {
          "label": "data(label)",
          "font-size": 15,
          "text-wrap": "wrap",
          "text-max-width": 180,
          "padding": "14px",
          "width": "label",
          "height": "label",
          "text-valign": "center",
          "text-halign": "center",
          "color": "#333"
        }
      },
      {
        selector: "node[type='dataset']",
        style: {
          "shape": "round-rectangle",
          "background-color": "#e3f2fd",
          "border-color": "data(borderColor)",
          "border-width": "data(borderWidth)"
        }
      },
      {
        selector: "node[type='job']",
        style: {
          "shape": "round-rectangle",
          "corner-radius": 999,
          "background-color": "#fff3e0",
          "border-color": "#ef6c00",
          "border-width": 2,
          "width": 140,
          "height": 50
        }
      },
      {
        selector: ".faded",
        style: { "opacity": 0.15 }
      },
      {
        selector: "edge",
        style: {
          "curve-style": "straight",
          "target-arrow-shape": "triangle",
          "line-color": "#9aa0a6",
          "target-arrow-color": "#9aa0a6",
          "width": 2
        }
      }
    ]
  });

  cy.fit();

  const searchInput = document.getElementById("searchInput");
  const hitCount = document.getElementById("hitCount");
  const suggestionsBox = document.getElementById("suggestions");

  let activeFilters = { type: null, medal: null };

  function applyAllFilters() {
    const q = searchInput.value.toLowerCase().trim();
    let hits = 0;

    cy.elements().addClass("faded");

    cy.nodes().forEach(node => {

      const label = (node.data("label") || "").toLowerCase();
      const meta = node.data("meta") || {};
      const type = node.data("type");
      const medal = (meta.dataset_medaille || "").toLowerCase();

      let match = true;

      // zoek
      if (q) {
        match = label.includes(q) ||
          Object.values(meta).some(v =>
            v && v.toString().toLowerCase().includes(q)
          );
      }

      // filters
      if (activeFilters.type && type !== activeFilters.type) match = false;
      if (activeFilters.medal && medal !== activeFilters.medal) match = false;

      if (match) {
        node.removeClass("faded");
        node.predecessors().removeClass("faded");
        node.successors().removeClass("faded");
        hits++;
      }
    });

    hitCount.innerText = q ? `${hits} resultaten` : "";
  }

  // 🔍 zoeken + suggesties
  searchInput.addEventListener("input", () => {

    const q = searchInput.value.toLowerCase();
    suggestionsBox.innerHTML = "";

    if (q) {
      const matches = [];

      cy.nodes().forEach(node => {
        const label = node.data("label");
        if (label.toLowerCase().includes(q)) {
          matches.push(label);
        }
      });

      matches.slice(0, 10).forEach(m => {
        const div = document.createElement("div");
        div.innerText = m;

        div.onclick = () => {
          searchInput.value = m;
          suggestionsBox.innerHTML = "";
          applyAllFilters();

          const node = cy.nodes().filter(n => n.data("label") === m);
          if (node.length) cy.fit(node, 100);
        };

        suggestionsBox.appendChild(div);
      });
    }

    applyAllFilters();
  });

  // 🎛 filters
  document.querySelectorAll("#filters button").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.filter) activeFilters.type = btn.dataset.filter;
      if (btn.dataset.medal) activeFilters.medal = btn.dataset.medal;
      applyAllFilters();
    });
  });

  document.getElementById("resetFilters").onclick = () => {
    activeFilters = { type: null, medal: null };
    searchInput.value = "";
    suggestionsBox.innerHTML = "";
    cy.elements().removeClass("faded");
  };

  // 🎯 klik (focus + details)
  cy.on("tap", "node", evt => {

    const node = evt.target;
    const meta = node.data("meta") || {};

    cy.elements().addClass("faded");
    node.removeClass("faded");
    node.predecessors().removeClass("faded");
    node.successors().removeClass("faded");

    const eles = node.union(node.predecessors()).union(node.successors());
    cy.fit(eles, 80);

    let html = "<table class='meta'>";
    for (const [key, value] of Object.entries(meta)) {
      if (!value) continue;
      let v = value;

      if (key.includes("datum")) {
        try { v = new Date(value).toLocaleString(); } catch {}
      }

      html += `<tr><th>${key}</th><td>${v}</td></tr>`;
    }
    html += "</table>";

    document.getElementById("details-content").innerHTML = html;
  });

  // klik buiten = suggestions sluiten
  document.addEventListener("click", e => {
    if (!e.target.closest("#filterbox")) {
      suggestionsBox.innerHTML = "";
    }
  });
}

loadLineage();