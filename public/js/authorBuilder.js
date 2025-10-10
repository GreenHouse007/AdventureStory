(function () {
  const COLOR_OPTIONS = ["twilight", "ember", "moss", "dusk", "rose", "slate"];
  const ENDING_TYPES = ["true", "death", "secret", "other"];

  const storyForm = document.getElementById("authorStoryForm");
  const hiddenInputs = document.getElementById("builderDataInputs");
  const builderDataEl = document.getElementById("builder-data");
  const startNodeSelect = document.getElementById("story-start-node");
  const coverImageSelect = document.getElementById("story-cover-image");
  const mapViewport = document.getElementById("mapViewport");
  const mapCanvas = document.getElementById("mapCanvas");
  const linkLayer = document.getElementById("linkLayer");
  const addNodeBtn = document.getElementById("add-node-btn");
  const addEndingBtn = document.getElementById("add-ending-btn");
  const centerSelectionBtn = document.getElementById("center-selection-btn");
  const zoomOutBtn = document.getElementById("map-zoom-out-btn");
  const zoomInBtn = document.getElementById("map-zoom-in-btn");
  const entityEditor = document.getElementById("entityEditor");
  const editorTitle = document.getElementById("entityEditorTitle");
  const editorSubtitle = document.getElementById("entityEditorSubtitle");
  const collapseBtn = document.getElementById("editorCollapseBtn");
  const nodeDeleteBtn = document.getElementById("node-delete");
  const endingDeleteBtn = document.getElementById("ending-delete");
  const nodeForm = document.getElementById("node-form");
  const endingForm = document.getElementById("ending-form");
  const choiceList = document.getElementById("choice-list");
  const choicesEmptyState = document.getElementById("choicesEmptyState");
  const choiceAddForm = document.getElementById("choice-add-form");
  const choiceAddLockToggle = choiceAddForm?.querySelector('[data-lock-toggle]');
  const choiceAddCostInput = choiceAddForm?.querySelector('[data-lock-cost]');

  const storyId = storyForm.dataset.storyId || "";
  const titleInput = storyForm.elements?.title || null;
  const descriptionInput = storyForm.elements?.description || null;
  const categoryInputs = Array.from(
    storyForm.querySelectorAll('input[name="categories"]') || []
  );

  const canAutosave = Boolean(storyId);
  let autosaveTimer = null;
  let autosavePending = false;
  let autosaveInFlight = false;

  const sanitizeEntityId = (value) => {
    if (typeof value !== "string") return "";
    return value
      .replace(/\u00a0/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "")
      .replace(/\s+$/, "");
  };

  const serializeStoryForRequest = () => {
    validateStory();
    return {
      title: storyData.title || "",
      description: storyData.description || "",
      coverImage: storyData.coverImage || "",
      categories: Array.isArray(storyData.categories) ? storyData.categories : [],
      startNodeId: storyData.startNodeId || "",
      nodes: storyData.nodes.map((node) => ({
        _id: node._id || "",
        text: node.text || "",
        image: node.image || "",
        color: COLOR_OPTIONS.includes(node.color) ? node.color : "twilight",
        position: {
          x: Number(node.position?.x ?? 0),
          y: Number(node.position?.y ?? 0),
        },
        choices: (Array.isArray(node.choices) ? node.choices : []).map((choice) => ({
          _id: choice._id || "",
          label: choice.label || "",
          nextNodeId: choice.nextNodeId || "",
          locked: Boolean(choice.locked),
          unlockCost: Math.max(Number(choice.unlockCost) || 0, 0),
        })),
      })),
      endings: storyData.endings.map((ending) => ({
        _id: ending._id || "",
        label: ending.label || "",
        type: ENDING_TYPES.includes(ending.type) ? ending.type : "other",
        text: ending.text || "",
        image: ending.image || "",
        position: {
          x: Number(ending.position?.x ?? 0),
          y: Number(ending.position?.y ?? 0),
        },
      })),
    };
  };

  const triggerAutosave = async () => {
    if (!canAutosave) return;
    if (autosaveInFlight) {
      autosavePending = true;
      return;
    }

    autosavePending = false;
    autosaveInFlight = true;

    const payload = serializeStoryForRequest();

    try {
      const response = await fetch(`/u/authors/stories/${storyId}/autosave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        console.error("Autosave failed", response.status, errorBody);
      }
    } catch (err) {
      console.error("Autosave error", err);
    } finally {
      autosaveInFlight = false;
      if (autosavePending) {
        autosavePending = false;
        triggerAutosave();
      }
    }
  };

  const scheduleAutosave = ({ flush = false } = {}) => {
    if (!canAutosave) return;
    if (flush) {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      autosavePending = true;
      triggerAutosave();
      return;
    }

    autosavePending = true;
    if (autosaveTimer) return;
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      triggerAutosave();
    }, 800);
  };

  if (!storyForm || !hiddenInputs || !builderDataEl || !nodeForm || !endingForm) {
    return;
  }

  const MIN_MAP_SCALE = 0.5;
  const MAX_MAP_SCALE = 1.6;
  const MAP_SCALE_STEP = 0.1;

  let mapScale = 1;
  let storyData = {};
  let selected = null;
  let drawFrame = null;
  const elementIndex = new Map();

  const parseInitial = () => {
    try {
      return JSON.parse(builderDataEl.textContent || "{}");
    } catch (err) {
      console.error("Failed to parse builder data", err);
      return {};
    }
  };

  const normalizeStory = (raw) => {
    const story = Object.assign(
      {
        title: "",
        description: "",
        coverImage: "",
        categories: [],
        startNodeId: "",
        nodes: [],
        endings: [],
        images: [],
      },
      raw || {}
    );
    story.nodes = Array.isArray(story.nodes) ? story.nodes : [];
    story.endings = Array.isArray(story.endings) ? story.endings : [];
    story.categories = Array.isArray(story.categories) ? story.categories : [];
    story.images = Array.isArray(story.images)
      ? story.images
          .map((img) => {
            if (!img) return null;
            if (typeof img === "string") {
              return {
                url: img,
                title: img,
                publicId: "",
              };
            }
            const url = img.url || img.path || "";
            if (!url) return null;
            return {
              url,
              title: img.title || img.displayName || url,
              publicId: img.publicId || img.filename || "",
            };
          })
          .filter(Boolean)
      : [];

    const usedNodeIds = new Set();
    story.nodes = story.nodes.map((node, index) => {
      const requestedId =
        typeof node?._id === "string" && node._id.trim()
          ? node._id.trim()
          : typeof node?.id === "string" && node.id.trim()
          ? node.id.trim()
          : "";
      let id = requestedId || `passage-${index + 1}`;
      let counter = 1;
      while (usedNodeIds.has(id)) {
        id = `${requestedId || `passage-${index + 1}`}-${counter}`;
        counter += 1;
      }
      usedNodeIds.add(id);

      return {
        _id: id,
        text: node.text || "",
        image: node.image || "",
        color: COLOR_OPTIONS.includes(node.color) ? node.color : "twilight",
        position: node.position || null,
        choices: Array.isArray(node.choices)
          ? node.choices.map((choice) => ({
              _id: choice?._id || "",
              label: choice?.label || "",
              nextNodeId: choice?.nextNodeId || "",
              locked: Boolean(choice?.locked),
              unlockCost: Math.max(Number(choice?.unlockCost) || 0, 0),
            }))
          : [],
      };
    });

    const usedEndingIds = new Set();
    story.endings = story.endings.map((ending, index) => {
      const requestedId =
        typeof ending?._id === "string" && ending._id.trim()
          ? ending._id.trim()
          : typeof ending?.id === "string" && ending.id.trim()
          ? ending.id.trim()
          : "";
      let id = requestedId || `ending-${index + 1}`;
      let counter = 1;
      while (usedEndingIds.has(id)) {
        id = `${requestedId || `ending-${index + 1}`}-${counter}`;
        counter += 1;
      }
      usedEndingIds.add(id);

      const type = ENDING_TYPES.includes(ending.type) ? ending.type : "other";

      return {
        _id: id,
        label: ending.label || id,
        type,
        text: ending.text || "",
        image: ending.image || "",
        position: ending.position || null,
      };
    });

    if (story.nodes.length) {
      const hasStart = story.startNodeId
        ? story.nodes.some((node) => node._id === story.startNodeId)
        : false;
      if (!hasStart) {
        story.startNodeId = story.nodes[0]._id;
      }
    } else {
      story.startNodeId = "";
    }

    return story;
  };

  storyData = normalizeStory(parseInitial());

  const ensurePositions = () => {
    const spacingX = 240;
    const spacingY = 200;
    storyData.nodes.forEach((node, idx) => {
      if (!node.position || typeof node.position.x !== "number" || typeof node.position.y !== "number") {
        node.position = {
          x: 160 + (idx % 5) * spacingX,
          y: 160 + Math.floor(idx / 5) * spacingY,
        };
      }
      if (!COLOR_OPTIONS.includes(node.color)) {
        node.color = "twilight";
      }
    });
    const nodeRows = Math.max(1, Math.ceil(storyData.nodes.length / 5));
    storyData.endings.forEach((ending, idx) => {
      if (!ending.position || typeof ending.position.x !== "number" || typeof ending.position.y !== "number") {
        ending.position = {
          x: 160 + (idx % 4) * spacingX,
          y: 160 + (nodeRows + 1 + Math.floor(idx / 4)) * spacingY,
        };
      }
      if (!ENDING_TYPES.includes(ending.type)) {
        ending.type = "other";
      }
    });
  };

  ensurePositions();
  const getViewportWidthInContent = (scale = mapScale) => {
    const factor = scale > 0 ? scale : 1;
    return mapViewport.clientWidth / factor;
  };

  const getViewportHeightInContent = (scale = mapScale) => {
    const factor = scale > 0 ? scale : 1;
    return mapViewport.clientHeight / factor;
  };

  const getViewportCenter = (scale = mapScale) => ({
    x: mapViewport.scrollLeft + getViewportWidthInContent(scale) / 2,
    y: mapViewport.scrollTop + getViewportHeightInContent(scale) / 2,
  });

  const applyMapScale = () => {
    mapCanvas.style.transform = `scale(${mapScale})`;
  };

  const updateZoomButtons = () => {
    if (zoomOutBtn) {
      zoomOutBtn.disabled = mapScale <= MIN_MAP_SCALE + 0.001;
    }
    if (zoomInBtn) {
      zoomInBtn.disabled = mapScale >= MAX_MAP_SCALE - 0.001;
    }
  };

  applyMapScale();
  updateZoomButtons();

  const getImageOptions = () => (Array.isArray(storyData.images) ? storyData.images : []);

  const populateImageSelect = (selectEl, currentValue) => {
    if (!selectEl) return;
    const options = getImageOptions();
    selectEl.innerHTML = "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No image";
    selectEl.appendChild(emptyOption);
    let matched = false;
    options.forEach((opt) => {
      if (!opt || !opt.url) return;
      const option = document.createElement("option");
      option.value = opt.url;
      option.textContent = opt.title || opt.url;
      if (currentValue && currentValue === opt.url) {
        option.selected = true;
        matched = true;
      }
      selectEl.appendChild(option);
    });
    if (currentValue && !matched) {
      const legacy = document.createElement("option");
      legacy.value = currentValue;
      legacy.selected = true;
      legacy.textContent = `Current: ${currentValue}`;
      selectEl.appendChild(legacy);
    }
  };

  const refreshCoverImageSelect = () => {
    populateImageSelect(coverImageSelect, storyData.coverImage || "");
  };

  refreshCoverImageSelect();

  const scheduleDrawLinks = () => {
    if (drawFrame) return;
    drawFrame = requestAnimationFrame(() => {
      drawFrame = null;
      drawLinks();
    });
  };

  const updateStartNodeOptions = () => {
    if (!startNodeSelect) return;
    const selectedValue = storyData.startNodeId;
    startNodeSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Select --";
    startNodeSelect.appendChild(placeholder);
    storyData.nodes.forEach((node) => {
      const option = document.createElement("option");
      option.value = node._id;
      option.textContent = node._id || "(untitled)";
      if (node._id === selectedValue) {
        option.selected = true;
      }
      startNodeSelect.appendChild(option);
    });
  };

  const populateDestinationSelect = (selectEl, selectedValue) => {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    storyData.nodes.forEach((node) => {
      const option = document.createElement("option");
      option.value = node._id;
      option.textContent = node._id || "(untitled)";
      if (node._id === selectedValue) option.selected = true;
      selectEl.appendChild(option);
    });
    storyData.endings.forEach((ending) => {
      const option = document.createElement("option");
      option.value = ending._id;
      const typeLabel = ending.type ? ending.type.toUpperCase() : "ENDING";
      option.textContent = `Ending: ${ending._id || "(untitled)"} (${typeLabel})`;
      if (ending._id === selectedValue) option.selected = true;
      selectEl.appendChild(option);
    });
  };

  const drawLinks = () => {
    const width = parseFloat(mapCanvas.style.width) || mapCanvas.scrollWidth || 2400;
    const height = parseFloat(mapCanvas.style.height) || mapCanvas.scrollHeight || 1600;
    linkLayer.setAttribute("width", width);
    linkLayer.setAttribute("height", height);
    linkLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
    linkLayer.innerHTML = "";

    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "defs");
    const createMarker = (id, color) => {
      const marker = document.createElementNS(ns, "marker");
      marker.setAttribute("id", id);
      marker.setAttribute("markerWidth", "10");
      marker.setAttribute("markerHeight", "10");
      marker.setAttribute("refX", "8");
      marker.setAttribute("refY", "5");
      marker.setAttribute("orient", "auto");
      marker.setAttribute("markerUnits", "strokeWidth");
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", "M0,0 L10,5 L0,10 z");
      path.setAttribute("fill", color);
      marker.appendChild(path);
      return marker;
    };
    defs.appendChild(createMarker("link-arrow", "rgba(108, 92, 231, 0.75)"));
    defs.appendChild(createMarker("link-arrow-ending", "rgba(255, 139, 92, 0.85)"));
    linkLayer.appendChild(defs);

    const frag = document.createDocumentFragment();
    storyData.nodes.forEach((node) => {
      const fromEntry = elementIndex.get(node._id);
      if (!fromEntry) return;
      (Array.isArray(node.choices) ? node.choices : []).forEach((choice) => {
        const targetEntry = elementIndex.get(choice.nextNodeId);
        if (!targetEntry) return;
        const fromEl = fromEntry.element;
        const toEl = targetEntry.element;
        const fx = fromEl.offsetLeft + fromEl.offsetWidth / 2;
        const fy = fromEl.offsetTop + fromEl.offsetHeight / 2;
        const tx = toEl.offsetLeft + toEl.offsetWidth / 2;
        const ty = toEl.offsetTop + toEl.offsetHeight / 2;
        const midX = (fx + tx) / 2;
        const midY = (fy + ty) / 2;
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", `M${fx},${fy} C${midX},${fy} ${midX},${ty} ${tx},${ty}`);
        path.classList.add("link");
        if (targetEntry.type === "ending") {
          path.classList.add("to-ending");
          path.setAttribute("marker-end", "url(#link-arrow-ending)");
        } else {
          path.setAttribute("marker-end", "url(#link-arrow)");
        }
        if (choice.locked) {
          path.classList.add("locked");
        }
        frag.appendChild(path);
        if (choice.locked) {
          const lockIcon = document.createElementNS(ns, "text");
          lockIcon.setAttribute("x", midX);
          lockIcon.setAttribute("y", midY);
          lockIcon.setAttribute("text-anchor", "middle");
          lockIcon.setAttribute("dominant-baseline", "middle");
          lockIcon.classList.add("link-lock-icon");
          lockIcon.textContent = "🔒";
          frag.appendChild(lockIcon);
        }
      });
    });
    linkLayer.appendChild(frag);
  };

  const highlightSelection = () => {
    document
      .querySelectorAll(".map-node.selected")
      .forEach((el) => el.classList.remove("selected"));
    if (!selected) return;
    const entry = elementIndex.get(selected.id);
    if (entry && entry.element) {
      entry.element.classList.add("selected");
    }
  };

  const updateEntityEditorVisibility = () => {
    if (!selected) {
      entityEditor.classList.add("hidden");
      return;
    }
    entityEditor.classList.remove("hidden");
  };
  const renderChoices = (node) => {
    if (!choiceList) return;
    choiceList.innerHTML = "";
    if (!node || !Array.isArray(node.choices) || node.choices.length === 0) {
      choicesEmptyState.classList.remove("hidden");
      return;
    }
    choicesEmptyState.classList.add("hidden");
    node.choices.forEach((choice, index) => {
      const item = document.createElement("div");
      item.className = "choice-item";
      if (choice.locked) {
        item.classList.add("locked");
      }

      const fields = document.createElement("div");
      fields.className = "choice-fields";

      const labelField = document.createElement("label");
      labelField.className = "choice-field choice-field--label";
      const labelSpan = document.createElement("span");
      labelSpan.textContent = "Label";
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = choice.label || "";
      labelField.appendChild(labelSpan);
      labelField.appendChild(labelInput);

      const selectField = document.createElement("label");
      selectField.className = "choice-field";
      const selectSpan = document.createElement("span");
      selectSpan.textContent = "Next";
      const select = document.createElement("select");
      populateDestinationSelect(select, choice.nextNodeId);
      selectField.appendChild(selectSpan);
      selectField.appendChild(select);

      const lockedField = document.createElement("label");
      lockedField.className = "choice-field choice-field--toggle";
      const lockedSpan = document.createElement("span");
      lockedSpan.textContent = "Locked";
      const lockedInput = document.createElement("input");
      lockedInput.type = "checkbox";
      lockedInput.checked = Boolean(choice.locked);
      lockedField.appendChild(lockedSpan);
      lockedField.appendChild(lockedInput);

      const costField = document.createElement("label");
      costField.className = "choice-field choice-field--cost";
      const costSpan = document.createElement("span");
      costSpan.textContent = "Unlock Cost";
      const costInput = document.createElement("input");
      costInput.type = "number";
      costInput.min = "0";
      costInput.step = "1";
      costInput.value = Math.max(Number(choice.unlockCost) || 0, 0);
      costField.appendChild(costSpan);
      costField.appendChild(costInput);

      fields.appendChild(labelField);
      fields.appendChild(selectField);
      fields.appendChild(lockedField);
      fields.appendChild(costField);
      item.appendChild(fields);

      const actions = document.createElement("div");
      actions.className = "choice-actions";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn small danger";
      removeBtn.textContent = "Remove";
      actions.appendChild(removeBtn);
      item.appendChild(actions);

      const syncLockState = () => {
        const isLocked = lockedInput.checked;
        item.classList.toggle("locked", isLocked);
        costInput.disabled = !isLocked;
      };
      syncLockState();

      labelInput.addEventListener("input", () => {
        choice.label = labelInput.value;
        scheduleAutosave();
      });
      select.addEventListener("change", () => {
        choice.nextNodeId = select.value;
        scheduleDrawLinks();
        scheduleAutosave({ flush: true });
      });
      lockedInput.addEventListener("change", () => {
        choice.locked = lockedInput.checked;
        if (!choice.locked) {
          choice.unlockCost = 0;
          costInput.value = "0";
        }
        syncLockState();
        scheduleDrawLinks();
        scheduleAutosave({ flush: true });
      });
      costInput.addEventListener("input", () => {
        const value = Math.max(Number(costInput.value) || 0, 0);
        choice.unlockCost = value;
        costInput.value = String(value);
        scheduleAutosave();
      });

      removeBtn.addEventListener("click", () => {
        node.choices.splice(index, 1);
        renderChoices(node);
        scheduleDrawLinks();
        scheduleAutosave({ flush: true });
      });

      choiceList.appendChild(item);
    });
  };

  const fillNodeForm = (node) => {
    if (!node) return;
    nodeForm.dataset.originalId = node._id;
    nodeForm.elements._id.value = node._id || "";
    nodeForm.elements.color.value = COLOR_OPTIONS.includes(node.color) ? node.color : "twilight";
    populateImageSelect(nodeForm.elements.image, node.image || "");
    nodeForm.elements.text.value = node.text || "";
  };

  const fillEndingForm = (ending) => {
    if (!ending) return;
    endingForm.dataset.originalId = ending._id;
    endingForm.elements._id.value = ending._id || "";
    endingForm.elements.type.value = ENDING_TYPES.includes(ending.type) ? ending.type : "other";
    populateImageSelect(endingForm.elements.image, ending.image || "");
    endingForm.elements.text.value = ending.text || "";
  };

  const refreshInspector = () => {
    if (!selected) {
      nodeForm.classList.add("hidden");
      endingForm.classList.add("hidden");
      choiceAddForm.classList.add("hidden");
      document.querySelectorAll('[data-editor="node"]').forEach((el) => el.classList.add("hidden"));
      nodeDeleteBtn.classList.add("hidden");
      endingDeleteBtn.classList.add("hidden");
      editorSubtitle.textContent = "";
      return;
    }
    if (selected.type === "node") {
      const node = storyData.nodes.find((n) => n._id === selected.id);
      if (!node) return;
      editorTitle.textContent = "Passage";
      editorSubtitle.textContent = node._id || "Unnamed passage";
      nodeDeleteBtn.classList.remove("hidden");
      endingDeleteBtn.classList.add("hidden");
      nodeForm.classList.remove("hidden");
      endingForm.classList.add("hidden");
      document.querySelectorAll('[data-editor="node"]').forEach((el) => el.classList.remove("hidden"));
      choiceAddForm.classList.remove("hidden");
      choiceAddForm.dataset.nodeId = node._id;
      populateDestinationSelect(choiceAddForm.elements.nextNodeId, "");
      fillNodeForm(node);
      renderChoices(node);
    } else if (selected.type === "ending") {
      const ending = storyData.endings.find((e) => e._id === selected.id);
      if (!ending) return;
      editorTitle.textContent = "Ending";
      editorSubtitle.textContent = ending._id || "Unnamed ending";
      nodeDeleteBtn.classList.add("hidden");
      endingDeleteBtn.classList.remove("hidden");
      document.querySelectorAll('[data-editor="node"]').forEach((el) => el.classList.add("hidden"));
      nodeForm.classList.add("hidden");
      endingForm.classList.remove("hidden");
      choiceAddForm.classList.add("hidden");
      fillEndingForm(ending);
    }
  };
  const selectEntity = (type, id, { focusInspector = true } = {}) => {
    const previousSelection = selected ? { ...selected } : null;
    if (!type || !id) {
      selected = null;
      highlightSelection();
      refreshInspector();
      updateEntityEditorVisibility();
      if (previousSelection) {
        scheduleAutosave({ flush: true });
      }
      return;
    }
    selected = { type, id };
    highlightSelection();
    refreshInspector();
    updateEntityEditorVisibility();
    if (focusInspector) {
      entityEditor.classList.remove("collapsed");
      collapseBtn.textContent = "Collapse";
      collapseBtn.setAttribute("aria-expanded", "true");
    }
    if (
      previousSelection &&
      (previousSelection.type !== selected.type || previousSelection.id !== selected.id)
    ) {
      scheduleAutosave({ flush: true });
    }
  };

  const renderMap = () => {
    elementIndex.clear();
    const existingLinks = linkLayer;
    mapCanvas.innerHTML = "";
    mapCanvas.appendChild(existingLinks);

    const entities = [...storyData.nodes, ...storyData.endings];
    let maxX = 600;
    let maxY = 400;
    entities.forEach((entity) => {
      if (!entity.position) return;
      maxX = Math.max(maxX, entity.position.x + 320);
      maxY = Math.max(maxY, entity.position.y + 260);
    });
    const viewportWidth = mapViewport.clientWidth || 0;
    const viewportHeight = mapViewport.clientHeight || 0;
    const width = Math.max(960, viewportWidth, maxX + 160);
    const height = Math.max(720, viewportHeight, maxY + 160);
    mapCanvas.style.width = `${width}px`;
    mapCanvas.style.height = `${height}px`;
    existingLinks.setAttribute("width", width);
    existingLinks.setAttribute("height", height);
    existingLinks.setAttribute("viewBox", `0 0 ${width} ${height}`);
    existingLinks.style.width = `${width}px`;
    existingLinks.style.height = `${height}px`;

    const createElement = (entity, type) => {
      const el = document.createElement("div");
      el.className = `map-node ${type} draggable`;
      if (type === "node") {
        el.classList.add(`color-${entity.color || "twilight"}`);
        if (storyData.startNodeId === entity._id) {
          el.classList.add("start-node");
        }
      }
      el.dataset.id = entity._id;
      el.dataset.entityType = type;
      const x = entity.position?.x ?? 0;
      const y = entity.position?.y ?? 0;
      el.dataset.x = x;
      el.dataset.y = y;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;

      const header = document.createElement("div");
      header.className = "node-title";
      const idSpan = document.createElement("span");
      idSpan.className = "node-id";
      idSpan.textContent = entity._id || "(untitled)";
      header.appendChild(idSpan);
      if (entity.image) {
        const imgFlag = document.createElement("span");
        imgFlag.className = "image-flag";
        imgFlag.textContent = "🖼";
        header.appendChild(imgFlag);
      }
      el.appendChild(header);

      const snippet = document.createElement("p");
      snippet.className = "node-snippet";
      const textSource = (entity.text || "")
        .replace(/\s+/g, " ")
        .trim();
      if (textSource) {
        const limit = 160;
        snippet.textContent =
          textSource.length > limit
            ? `${textSource.slice(0, limit)}…`
            : textSource;
      } else {
        snippet.textContent =
          type === "node" ? "Add your passage text" : "Describe this ending";
      }
      el.appendChild(snippet);

      const meta = document.createElement("div");
      meta.className = "node-meta";
      if (type === "node") {
        const choiceCount = Array.isArray(entity.choices) ? entity.choices.length : 0;
        meta.textContent = `${choiceCount} choice${choiceCount === 1 ? "" : "s"}`;
      } else {
        meta.textContent = (entity.type || "other").toUpperCase();
      }
      el.appendChild(meta);

      el.addEventListener("click", (event) => {
        event.stopPropagation();
        selectEntity(type, entity._id);
      });

      el.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        event.preventDefault();
        selectEntity(type, entity._id, { focusInspector: true });
      });

      elementIndex.set(entity._id, { element: el, type });
      mapCanvas.appendChild(el);
    };

    storyData.nodes.forEach((node) => {
      createElement(node, "node");
    });
    storyData.endings.forEach((ending) => {
      createElement(ending, "ending");
    });

    highlightSelection();
    drawLinks();
  };

  interact(".map-node.draggable").draggable({
    listeners: {
      move(event) {
        const target = event.target;
        const deltaX = event.dx / (mapScale || 1);
        const deltaY = event.dy / (mapScale || 1);
        const x = (parseFloat(target.dataset.x) || 0) + deltaX;
        const y = (parseFloat(target.dataset.y) || 0) + deltaY;
        target.dataset.x = x;
        target.dataset.y = y;
        target.style.left = `${x}px`;
        target.style.top = `${y}px`;
        scheduleDrawLinks();
      },
      end(event) {
        const target = event.target;
        const id = target.dataset.id;
        const type = target.dataset.entityType || "node";
        const x = parseFloat(target.dataset.x) || 0;
        const y = parseFloat(target.dataset.y) || 0;
        if (!id) return;
        if (type === "node") {
          const node = storyData.nodes.find((n) => n._id === id);
          if (node) {
            node.position = { x, y };
          }
        } else {
          const ending = storyData.endings.find((e) => e._id === id);
          if (ending) {
            ending.position = { x, y };
          }
        }
        scheduleAutosave({ flush: true });
      },
    },
    inertia: false,
  });

  renderMap();
  updateStartNodeOptions();
  refreshInspector();
  updateEntityEditorVisibility();
  mapViewport.addEventListener("click", () => {
    selectEntity(null, null);
  });

  collapseBtn.addEventListener("click", () => {
    const isCollapsed = entityEditor.classList.toggle("collapsed");
    collapseBtn.textContent = isCollapsed ? "Expand" : "Collapse";
    collapseBtn.setAttribute("aria-expanded", String(!isCollapsed));
  });

  const changeMapScale = (delta) => {
    const proposed = Math.round((mapScale + delta) * 100) / 100;
    const nextScale = Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, proposed));
    if (nextScale === mapScale) return;
    const previousScale = mapScale;
    const previousCenter = getViewportCenter(previousScale);
    mapScale = nextScale;
    applyMapScale();
    updateZoomButtons();
    const nextWidth = getViewportWidthInContent();
    const nextHeight = getViewportHeightInContent();
    mapViewport.scrollTo({
      left: Math.max(previousCenter.x - nextWidth / 2, 0),
      top: Math.max(previousCenter.y - nextHeight / 2, 0),
    });
    scheduleDrawLinks();
  };

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      changeMapScale(-MAP_SCALE_STEP);
    });
  }
  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      changeMapScale(MAP_SCALE_STEP);
    });
  }

  centerSelectionBtn?.addEventListener("click", () => {
    if (!selected) return;
    const entry = elementIndex.get(selected.id);
    if (!entry) return;
    const el = entry.element;
    const viewportWidth = getViewportWidthInContent();
    const viewportHeight = getViewportHeightInContent();
    const x = el.offsetLeft + el.offsetWidth / 2 - viewportWidth / 2;
    const y = el.offsetTop + el.offsetHeight / 2 - viewportHeight / 2;
    mapViewport.scrollTo({ left: Math.max(x, 0), top: Math.max(y, 0), behavior: "smooth" });
  });

  const generateUniqueId = (prefix) => {
    let counter = 1;
    let candidate = `${prefix}-${counter}`;
    const exists = (id) =>
      storyData.nodes.some((n) => n._id === id) || storyData.endings.some((e) => e._id === id);
    while (exists(candidate)) {
      counter += 1;
      candidate = `${prefix}-${counter}`;
    }
    return candidate;
  };

  addNodeBtn?.addEventListener("click", () => {
    const center = getViewportCenter();
    const newId = generateUniqueId("passage");
    const node = {
      _id: newId,
      text: "",
      image: "",
      color: "twilight",
      position: { x: center.x - 110, y: center.y - 80 },
      choices: [],
    };
    storyData.nodes.push(node);
    if (!storyData.startNodeId) {
      storyData.startNodeId = node._id;
    }
    renderMap();
    updateStartNodeOptions();
    selectEntity("node", node._id);
    scheduleAutosave({ flush: true });
  });

  addEndingBtn?.addEventListener("click", () => {
    const center = getViewportCenter();
    const newId = generateUniqueId("ending");
    const ending = {
      _id: newId,
      label: newId,
      type: "other",
      text: "",
      image: "",
      position: { x: center.x - 110, y: center.y - 80 },
    };
    storyData.endings.push(ending);
    renderMap();
    updateStartNodeOptions();
    selectEntity("ending", ending._id);
    scheduleAutosave({ flush: true });
  });

  nodeForm.addEventListener("input", () => {
    if (!selected || selected.type !== "node") return;
    const node = storyData.nodes.find((n) => n._id === nodeForm.dataset.originalId);
    if (!node) return;
    const idInput = nodeForm.elements._id;
    const sanitizedId = sanitizeEntityId(idInput.value || "");
    if (idInput.value !== sanitizedId) {
      idInput.value = sanitizedId;
    }
    const previousId = node._id;
    node._id = sanitizedId;
    node.color = nodeForm.elements.color.value;
    node.image = nodeForm.elements.image.value.trim();
    node.text = nodeForm.elements.text.value;
    if (previousId !== node._id) {
      if (storyData.startNodeId === previousId) {
        storyData.startNodeId = node._id;
      }
      storyData.nodes.forEach((n) => {
        n.choices.forEach((choice) => {
          if (choice.nextNodeId === previousId) {
            choice.nextNodeId = node._id;
          }
        });
      });
      if (selected && selected.id === previousId) {
        selected.id = node._id;
      }
      nodeForm.dataset.originalId = node._id;
    }
    updateStartNodeOptions();
    populateDestinationSelect(choiceAddForm.elements.nextNodeId, "");
    renderMap();
    selectEntity("node", node._id, { focusInspector: false });
    scheduleAutosave();
  });

  endingForm.addEventListener("input", () => {
    if (!selected || selected.type !== "ending") return;
    const currentOriginalId = endingForm.dataset.originalId;
    const ending = storyData.endings.find((e) => e._id === currentOriginalId);
    if (!ending) return;

    const idInput = endingForm.elements._id;
    const sanitizedId = sanitizeEntityId(idInput.value || "");
    if (idInput.value !== sanitizedId) {
      idInput.value = sanitizedId;
    }

    const previousId = ending._id;
    ending._id = sanitizedId;
    ending.type = endingForm.elements.type.value;
    ending.image = endingForm.elements.image.value.trim();
    ending.text = endingForm.elements.text.value;

    if (!ending.label || ending.label === previousId) {
      ending.label = ending._id;
    }

    if (previousId !== ending._id) {
      storyData.nodes.forEach((node) => {
        node.choices.forEach((choice) => {
          if (choice.nextNodeId === previousId) {
            choice.nextNodeId = ending._id;
          }
        });
      });
      if (selected && selected.id === previousId) {
        selected.id = ending._id;
      }
      endingForm.dataset.originalId = ending._id;
    }

    editorSubtitle.textContent = ending._id || "Unnamed ending";
    populateDestinationSelect(choiceAddForm.elements.nextNodeId, "");
    renderMap();
    scheduleAutosave();
  });

  const ensureNodeIdOnBlur = () => {
    if (!selected || selected.type !== "node") return;
    const input = nodeForm.elements._id;
    if (!input) return;
    if (input.value && input.value.trim()) return;
    input.value = generateUniqueId("passage");
    nodeForm.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const ensureEndingIdOnBlur = () => {
    if (!selected || selected.type !== "ending") return;
    const input = endingForm.elements._id;
    if (!input) return;
    if (input.value && input.value.trim()) return;
    input.value = generateUniqueId("ending");
    endingForm.dispatchEvent(new Event("input", { bubbles: true }));
  };

  nodeForm.elements._id?.addEventListener("blur", ensureNodeIdOnBlur);
  endingForm.elements._id?.addEventListener("blur", ensureEndingIdOnBlur);

  nodeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selected || selected.type !== "node") return;
    const node = storyData.nodes.find((n) => n._id === selected.id);
    if (node) {
      fillNodeForm(node);
    }
  });

  endingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selected || selected.type !== "ending") return;
    const ending = storyData.endings.find((e) => e._id === selected.id);
    if (ending) {
      fillEndingForm(ending);
    }
  });

  choiceAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selected || selected.type !== "node") return;
    const node = storyData.nodes.find((n) => n._id === selected.id);
    if (!node) return;
    const choice = {
      label: choiceAddForm.elements.label.value.trim(),
      nextNodeId: choiceAddForm.elements.nextNodeId.value,
      locked: Boolean(choiceAddLockToggle?.checked),
      unlockCost: Boolean(choiceAddLockToggle?.checked)
        ? Math.max(Number(choiceAddCostInput?.value) || 0, 0)
        : 0,
    };
    node.choices.push(choice);
    choiceAddForm.reset();
    if (choiceAddCostInput) {
      choiceAddCostInput.value = "0";
    }
    if (choiceAddLockToggle) {
      choiceAddLockToggle.checked = false;
      syncAddLockState();
    }
    renderChoices(node);
    scheduleDrawLinks();
    scheduleAutosave({ flush: true });
  });

  const syncAddLockState = () => {
    if (!choiceAddCostInput || !choiceAddLockToggle) return;
    const isLocked = choiceAddLockToggle.checked;
    choiceAddCostInput.disabled = !isLocked;
    if (!isLocked) {
      choiceAddCostInput.value = "0";
    }
  };
  if (choiceAddLockToggle) {
    choiceAddLockToggle.addEventListener("change", syncAddLockState);
    syncAddLockState();
  }

  const syncCategoriesFromForm = () => {
    storyData.categories = categoryInputs
      .filter((input) => input.checked)
      .map((input) => input.value);
  };

  if (titleInput) {
    titleInput.addEventListener("input", () => {
      storyData.title = titleInput.value;
      scheduleAutosave();
    });
    titleInput.addEventListener("blur", () => {
      storyData.title = titleInput.value;
      scheduleAutosave({ flush: true });
    });
  }

  if (descriptionInput) {
    descriptionInput.addEventListener("input", () => {
      storyData.description = descriptionInput.value;
      scheduleAutosave();
    });
    descriptionInput.addEventListener("blur", () => {
      storyData.description = descriptionInput.value;
      scheduleAutosave({ flush: true });
    });
  }

  if (categoryInputs.length) {
    categoryInputs.forEach((input) => {
      input.addEventListener("change", () => {
        syncCategoriesFromForm();
        scheduleAutosave({ flush: true });
      });
    });
    syncCategoriesFromForm();
  }

  nodeDeleteBtn.addEventListener("click", () => {
    if (!selected || selected.type !== "node") return;
    const idx = storyData.nodes.findIndex((n) => n._id === selected.id);
    if (idx === -1) return;
    if (!confirm("Delete this passage?")) return;
    const removedId = storyData.nodes[idx]._id;
    storyData.nodes.splice(idx, 1);
    if (storyData.startNodeId === removedId) {
      storyData.startNodeId = storyData.nodes[0]?._id || "";
    }
    storyData.nodes.forEach((node) => {
      node.choices = node.choices.filter((choice) => choice.nextNodeId !== removedId);
    });
    renderMap();
    updateStartNodeOptions();
    selectEntity(null, null);
    scheduleAutosave({ flush: true });
  });

  endingDeleteBtn.addEventListener("click", () => {
    if (!selected || selected.type !== "ending") return;
    const idx = storyData.endings.findIndex((e) => e._id === selected.id);
    if (idx === -1) return;
    if (!confirm("Delete this ending?")) return;
    const removedId = storyData.endings[idx]._id;
    storyData.endings.splice(idx, 1);
    storyData.nodes.forEach((node) => {
      node.choices.forEach((choice) => {
        if (choice.nextNodeId === removedId) {
          choice.nextNodeId = "";
        }
      });
    });
    renderMap();
    updateStartNodeOptions();
    selectEntity(null, null);
    scheduleAutosave({ flush: true });
  });

  startNodeSelect?.addEventListener("change", () => {
    storyData.startNodeId = startNodeSelect.value;
    renderMap();
    scheduleAutosave({ flush: true });
  });
  const validateStory = () => {
    const errors = [];
    const nodeIds = new Set();
    storyData.nodes.forEach((node, index) => {
      if (!node._id) {
        node._id = generateUniqueId("passage");
      }
      if (nodeIds.has(node._id)) {
        const reassignedId = generateUniqueId("passage");
        node._id = reassignedId;
      }
      nodeIds.add(node._id);
      node.choices = node.choices.filter((choice) => {
        if (!choice) return false;
        const hasLabel = typeof choice.label === "string" && choice.label.trim();
        const hasNext = typeof choice.nextNodeId === "string" && choice.nextNodeId.trim();
        if (!hasLabel || !hasNext) {
          return false;
        }
        choice.label = choice.label.trim();
        choice.nextNodeId = choice.nextNodeId.trim();
        choice.unlockCost = choice.locked ? Math.max(Number(choice.unlockCost) || 0, 0) : 0;
        return true;
      });
    });

    const endingIds = new Set();
    storyData.endings.forEach((ending) => {
      const originalId = ending._id;
      const rawLabel = typeof ending.label === "string" ? ending.label : "";
      const trimmedLabel = rawLabel.trim();
      ending._id = typeof ending._id === "string" ? ending._id.trim() : "";
      if (!ending._id) {
        ending._id = generateUniqueId("ending");
      }
      if (endingIds.has(ending._id)) {
        const reassignedId = generateUniqueId("ending");
        ending._id = reassignedId;
      }
      endingIds.add(ending._id);
      const trimmedOriginalId =
        typeof originalId === "string" ? originalId.trim() : "";
      const hasCustomLabel =
        trimmedLabel && trimmedLabel !== trimmedOriginalId;
      ending.label = hasCustomLabel ? trimmedLabel : ending._id;
    });

    if (storyData.nodes.length) {
      const hasValidStart = storyData.nodes.some((node) => node._id === storyData.startNodeId);
      if (!hasValidStart) {
        storyData.startNodeId = storyData.nodes[0]._id;
        if (startNodeSelect) {
          startNodeSelect.value = storyData.startNodeId;
        }
      }
    } else {
      storyData.startNodeId = "";
      if (startNodeSelect) {
        startNodeSelect.value = "";
      }
    }

    return errors;
  };

  const createHiddenInput = (name, value) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    return input;
  };

  const persistStoryData = () => {
    hiddenInputs.innerHTML = "";
    storyData.nodes.forEach((node, index) => {
      hiddenInputs.appendChild(createHiddenInput(`nodes[${index}][_id]`, node._id));
      hiddenInputs.appendChild(createHiddenInput(`nodes[${index}][text]`, node.text));
      hiddenInputs.appendChild(createHiddenInput(`nodes[${index}][image]`, node.image));
      hiddenInputs.appendChild(createHiddenInput(`nodes[${index}][color]`, node.color));
      hiddenInputs.appendChild(createHiddenInput(`nodes[${index}][position][x]`, node.position?.x ?? 0));
      hiddenInputs.appendChild(createHiddenInput(`nodes[${index}][position][y]`, node.position?.y ?? 0));
      node.choices.forEach((choice, cIndex) => {
        hiddenInputs.appendChild(
          createHiddenInput(`nodes[${index}][choices][${cIndex}][_id]`, choice._id || "")
        );
        hiddenInputs.appendChild(
          createHiddenInput(`nodes[${index}][choices][${cIndex}][label]`, choice.label || "")
        );
        hiddenInputs.appendChild(
          createHiddenInput(
            `nodes[${index}][choices][${cIndex}][nextNodeId]`,
            choice.nextNodeId || ""
          )
        );
        hiddenInputs.appendChild(
          createHiddenInput(
            `nodes[${index}][choices][${cIndex}][locked]`,
            choice.locked ? "true" : "false"
          )
        );
        hiddenInputs.appendChild(
          createHiddenInput(
            `nodes[${index}][choices][${cIndex}][unlockCost]`,
            String(Math.max(Number(choice.unlockCost) || 0, 0))
          )
        );
      });
    });

    storyData.endings.forEach((ending, index) => {
      hiddenInputs.appendChild(createHiddenInput(`endings[${index}][_id]`, ending._id));
      hiddenInputs.appendChild(createHiddenInput(`endings[${index}][label]`, ending.label || ""));
      hiddenInputs.appendChild(createHiddenInput(`endings[${index}][type]`, ending.type));
      hiddenInputs.appendChild(createHiddenInput(`endings[${index}][image]`, ending.image || ""));
      hiddenInputs.appendChild(createHiddenInput(`endings[${index}][text]`, ending.text || ""));
      hiddenInputs.appendChild(createHiddenInput(`endings[${index}][position][x]`, ending.position?.x ?? 0));
      hiddenInputs.appendChild(createHiddenInput(`endings[${index}][position][y]`, ending.position?.y ?? 0));
    });
  };

  coverImageSelect?.addEventListener("change", (event) => {
    storyData.coverImage = event.target.value;
    scheduleAutosave({ flush: true });
  });

  storyForm.addEventListener("submit", (event) => {
    const errors = validateStory();
    if (errors.length) {
      event.preventDefault();
      alert(errors.join("\n"));
      return;
    }
    storyData.startNodeId = startNodeSelect?.value || storyData.startNodeId;
    storyData.coverImage = coverImageSelect?.value || storyData.coverImage || "";
    persistStoryData();
  });
})();
