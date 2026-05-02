/**
 * MediScan 3D Body Heatmap - Medical Standard Implementation
 *
 * A Three.js-based interactive 3D body visualization with:
 * - Low-poly procedural model with separate body part meshes
 * - Medical standard anatomical regions (Michigan Body Map inspired)
 * - Shader-based heatmap with medical gradient (Blue→Cyan→Green→Yellow→Red)
 * - Raycasting interaction with hold-to-increase
 * - Gender-toggleable body proportions
 * - Front/back/360° viewing modes
 *
 * @version 2.0.0
 * @author MediScan Team
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class BodyHeatmap3DNew {
  /**
   * @param {string} containerId - DOM element ID to mount the 3D viewer
   * @param {object} options - Configuration options
   * @param {function} options.onSelectionChange - Callback when selection changes
   * @param {array} options.initialSelection - Initial pain selections
   */
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      onSelectionChange: options.onSelectionChange || (() => {}),
      initialSelection: options.initialSelection || [],
      ...options
    };

    // Three.js core components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Raycasting for interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Body model and regions
    this.bodyModel = new THREE.Group();
    this.bodyMeshes = []; // All clickable meshes
    this.regionMeshMap = new Map(); // regionId -> [mesh names]
    this.meshRegionMap = new Map(); // mesh name -> regionId
    this.originalMaterials = new Map(); // mesh -> original material

    // State management
    this.currentView = 'front'; // 'front', 'back', '360'
    this.selectedRegions = new Map(); // regionId -> { intensity: 0-10, name, side }
    this.hoveredRegion = null;

    // Gender toggle for body shape variants
    this.gender = 'male'; // 'male' or 'female'

    // Hold-to-increase timing
    this.holdTimer = null;
    this.holdInterval = null;
    this.holdThreshold = 200; // ms before acceleration starts
    this.holdAcceleration = 150; // ms between intensity increases
    this.holdTriggered = false;
    this.mouseDownRegion = null;
    this.maxIntensity = 10;

    // Animation
    this.clock = new THREE.Clock();
    this.pulseTime = 0;

    // UI elements
    this.tooltip = null;
    this.isDarkMode = this.detectDarkMode();

    // Define medical standard anatomical regions
    this.regions = this.defineMedicalRegions();

    // Bind methods
    this.onMouseClick = this.onMouseClick.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.animate = this.animate.bind(this);
  }

  /**
   * Define medical standard anatomical regions based on Michigan Body Map
   * 35-46 regions covering front and back views
   */
  defineMedicalRegions() {
    return {
      // === FRONT VIEW REGIONS (17 regions) ===

      // Head and Neck (Front)
      'head-front': {
        id: 'head-front',
        name: 'Head',
        side: 'front',
        category: 'head-neck',
        meshes: ['head-front']
      },
      'face': {
        id: 'face',
        name: 'Face',
        side: 'front',
        category: 'head-neck',
        meshes: ['face']
      },
      'jaw': {
        id: 'jaw',
        name: 'Jaw',
        side: 'front',
        category: 'head-neck',
        meshes: ['jaw']
      },
      'neck-front': {
        id: 'neck-front',
        name: 'Neck',
        side: 'front',
        category: 'head-neck',
        meshes: ['neck-front']
      },

      // Torso (Front)
      'chest': {
        id: 'chest',
        name: 'Chest',
        side: 'front',
        category: 'torso',
        meshes: ['chest']
      },
      'abdomen': {
        id: 'abdomen',
        name: 'Abdomen',
        side: 'front',
        category: 'torso',
        meshes: ['abdomen']
      },
      'pelvis': {
        id: 'pelvis',
        name: 'Pelvis',
        side: 'front',
        category: 'torso',
        meshes: ['pelvis']
      },

      // Upper Limbs (Front) - Left
      'shoulder-left': {
        id: 'shoulder-left',
        name: 'Left Shoulder',
        side: 'front',
        category: 'upper-limb',
        meshes: ['shoulder-left']
      },
      'upper-arm-left': {
        id: 'upper-arm-left',
        name: 'Left Upper Arm',
        side: 'front',
        category: 'upper-limb',
        meshes: ['upper-arm-left']
      },
      'elbow-left': {
        id: 'elbow-left',
        name: 'Left Elbow',
        side: 'front',
        category: 'upper-limb',
        meshes: ['elbow-left']
      },
      'forearm-left': {
        id: 'forearm-left',
        name: 'Left Forearm',
        side: 'front',
        category: 'upper-limb',
        meshes: ['forearm-left']
      },
      'wrist-left': {
        id: 'wrist-left',
        name: 'Left Wrist',
        side: 'front',
        category: 'upper-limb',
        meshes: ['wrist-left']
      },
      'hand-left': {
        id: 'hand-left',
        name: 'Left Hand',
        side: 'front',
        category: 'upper-limb',
        meshes: ['hand-left']
      },

      // Upper Limbs (Front) - Right
      'shoulder-right': {
        id: 'shoulder-right',
        name: 'Right Shoulder',
        side: 'front',
        category: 'upper-limb',
        meshes: ['shoulder-right']
      },
      'upper-arm-right': {
        id: 'upper-arm-right',
        name: 'Right Upper Arm',
        side: 'front',
        category: 'upper-limb',
        meshes: ['upper-arm-right']
      },
      'elbow-right': {
        id: 'elbow-right',
        name: 'Right Elbow',
        side: 'front',
        category: 'upper-limb',
        meshes: ['elbow-right']
      },
      'forearm-right': {
        id: 'forearm-right',
        name: 'Right Forearm',
        side: 'front',
        category: 'upper-limb',
        meshes: ['forearm-right']
      },
      'wrist-right': {
        id: 'wrist-right',
        name: 'Right Wrist',
        side: 'front',
        category: 'upper-limb',
        meshes: ['wrist-right']
      },
      'hand-right': {
        id: 'hand-right',
        name: 'Right Hand',
        side: 'front',
        category: 'upper-limb',
        meshes: ['hand-right']
      },

      // Lower Limbs (Front) - Left
      'hip-left': {
        id: 'hip-left',
        name: 'Left Hip',
        side: 'front',
        category: 'lower-limb',
        meshes: ['hip-left']
      },
      'upper-leg-left': {
        id: 'upper-leg-left',
        name: 'Left Upper Leg',
        side: 'front',
        category: 'lower-limb',
        meshes: ['upper-leg-left']
      },
      'knee-left': {
        id: 'knee-left',
        name: 'Left Knee',
        side: 'front',
        category: 'lower-limb',
        meshes: ['knee-left']
      },
      'lower-leg-left': {
        id: 'lower-leg-left',
        name: 'Left Lower Leg',
        side: 'front',
        category: 'lower-limb',
        meshes: ['lower-leg-left']
      },
      'ankle-left': {
        id: 'ankle-left',
        name: 'Left Ankle',
        side: 'front',
        category: 'lower-limb',
        meshes: ['ankle-left']
      },
      'foot-left': {
        id: 'foot-left',
        name: 'Left Foot',
        side: 'front',
        category: 'lower-limb',
        meshes: ['foot-left']
      },

      // Lower Limbs (Front) - Right
      'hip-right': {
        id: 'hip-right',
        name: 'Right Hip',
        side: 'front',
        category: 'lower-limb',
        meshes: ['hip-right']
      },
      'upper-leg-right': {
        id: 'upper-leg-right',
        name: 'Right Upper Leg',
        side: 'front',
        category: 'lower-limb',
        meshes: ['upper-leg-right']
      },
      'knee-right': {
        id: 'knee-right',
        name: 'Right Knee',
        side: 'front',
        category: 'lower-limb',
        meshes: ['knee-right']
      },
      'lower-leg-right': {
        id: 'lower-leg-right',
        name: 'Right Lower Leg',
        side: 'front',
        category: 'lower-limb',
        meshes: ['lower-leg-right']
      },
      'ankle-right': {
        id: 'ankle-right',
        name: 'Right Ankle',
        side: 'front',
        category: 'lower-limb',
        meshes: ['ankle-right']
      },
      'foot-right': {
        id: 'foot-right',
        name: 'Right Foot',
        side: 'front',
        category: 'lower-limb',
        meshes: ['foot-right']
      },

      // === BACK VIEW REGIONS (19 regions) ===

      // Head and Neck (Back)
      'head-back': {
        id: 'head-back',
        name: 'Head (back)',
        side: 'back',
        category: 'head-neck',
        meshes: ['head-back']
      },
      'neck-back': {
        id: 'neck-back',
        name: 'Neck',
        side: 'back',
        category: 'head-neck',
        meshes: ['neck-back']
      },

      // Back/Torso (Back)
      'upper-back': {
        id: 'upper-back',
        name: 'Upper Back',
        side: 'back',
        category: 'torso',
        meshes: ['upper-back']
      },
      'middle-back': {
        id: 'middle-back',
        name: 'Middle Back',
        side: 'back',
        category: 'torso',
        meshes: ['middle-back']
      },
      'lower-back': {
        id: 'lower-back',
        name: 'Lower Back',
        side: 'back',
        category: 'torso',
        meshes: ['lower-back']
      },
      'buttocks': {
        id: 'buttocks',
        name: 'Buttocks',
        side: 'back',
        category: 'torso',
        meshes: ['buttocks-left', 'buttocks-right']
      },

      // Upper Limbs (Back) - Left
      'shoulder-back-left': {
        id: 'shoulder-back-left',
        name: 'Left Shoulder (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['shoulder-back-left']
      },
      'upper-arm-back-left': {
        id: 'upper-arm-back-left',
        name: 'Left Upper Arm (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['upper-arm-back-left']
      },
      'elbow-back-left': {
        id: 'elbow-back-left',
        name: 'Left Elbow (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['elbow-back-left']
      },
      'forearm-back-left': {
        id: 'forearm-back-left',
        name: 'Left Forearm (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['forearm-back-left']
      },
      'wrist-back-left': {
        id: 'wrist-back-left',
        name: 'Left Wrist (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['wrist-back-left']
      },
      'hand-back-left': {
        id: 'hand-back-left',
        name: 'Left Hand (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['hand-back-left']
      },

      // Upper Limbs (Back) - Right
      'shoulder-back-right': {
        id: 'shoulder-back-right',
        name: 'Right Shoulder (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['shoulder-back-right']
      },
      'upper-arm-back-right': {
        id: 'upper-arm-back-right',
        name: 'Right Upper Arm (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['upper-arm-back-right']
      },
      'elbow-back-right': {
        id: 'elbow-back-right',
        name: 'Right Elbow (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['elbow-back-right']
      },
      'forearm-back-right': {
        id: 'forearm-back-right',
        name: 'Right Forearm (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['forearm-back-right']
      },
      'wrist-back-right': {
        id: 'wrist-back-right',
        name: 'Right Wrist (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['wrist-back-right']
      },
      'hand-back-right': {
        id: 'hand-back-right',
        name: 'Right Hand (back)',
        side: 'back',
        category: 'upper-limb',
        meshes: ['hand-back-right']
      },

      // Lower Limbs (Back) - Left
      'hip-back-left': {
        id: 'hip-back-left',
        name: 'Left Hip (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['hip-back-left']
      },
      'upper-leg-back-left': {
        id: 'upper-leg-back-left',
        name: 'Left Upper Leg (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['upper-leg-back-left']
      },
      'knee-back-left': {
        id: 'knee-back-left',
        name: 'Left Knee (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['knee-back-left']
      },
      'lower-leg-back-left': {
        id: 'lower-leg-back-left',
        name: 'Left Lower Leg (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['lower-leg-back-left']
      },
      'ankle-back-left': {
        id: 'ankle-back-left',
        name: 'Left Ankle (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['ankle-back-left']
      },
      'foot-back-left': {
        id: 'foot-back-left',
        name: 'Left Foot (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['foot-back-left']
      },

      // Lower Limbs (Back) - Right
      'hip-back-right': {
        id: 'hip-back-right',
        name: 'Right Hip (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['hip-back-right']
      },
      'upper-leg-back-right': {
        id: 'upper-leg-back-right',
        name: 'Right Upper Leg (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['upper-leg-back-right']
      },
      'knee-back-right': {
        id: 'knee-back-right',
        name: 'Right Knee (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['knee-back-right']
      },
      'lower-leg-back-right': {
        id: 'lower-leg-back-right',
        name: 'Right Lower Leg (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['lower-leg-back-right']
      },
      'ankle-back-right': {
        id: 'ankle-back-right',
        name: 'Right Ankle (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['ankle-back-right']
      },
      'foot-back-right': {
        id: 'foot-back-right',
        name: 'Right Foot (back)',
        side: 'back',
        category: 'lower-limb',
        meshes: ['foot-back-right']
      }
    };
  }

  /**
   * Detect dark mode preference
   */
  detectDarkMode() {
    if (document.documentElement.getAttribute('data-theme') === 'dark') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Medical gradient color mapping (0-10 scale)
   * Blue (0) → Cyan (2.5) → Green (5) → Yellow (7.5) → Red (10)
   */
  getMedicalColor(intensity) {
    if (intensity <= 0) return null;

    const clamped = Math.max(0, Math.min(10, intensity));
    const t = clamped / 10;

    // Medical gradient colors (RGB normalized 0-1)
    const colors = [
      { t: 0.0, r: 0.0, g: 0.0, b: 1.0 },    // Blue (none)
      { t: 0.25, r: 0.0, g: 1.0, b: 1.0 },   // Cyan (mild)
      { t: 0.5, r: 0.0, g: 1.0, b: 0.0 },    // Green (moderate)
      { t: 0.75, r: 1.0, g: 1.0, b: 0.0 },   // Yellow (severe)
      { t: 1.0, r: 1.0, g: 0.0, b: 0.0 }     // Red (extreme)
    ];

    // Find the two colors to interpolate between
    let lower = colors[0];
    let upper = colors[colors.length - 1];

    for (let i = 0; i < colors.length - 1; i++) {
      if (t >= colors[i].t && t <= colors[i + 1].t) {
        lower = colors[i];
        upper = colors[i + 1];
        break;
      }
    }

    // Interpolate
    const range = upper.t - lower.t;
    const localT = range === 0 ? 0 : (t - lower.t) / range;

    const r = lower.r + (upper.r - lower.r) * localT;
    const g = lower.g + (upper.g - lower.g) * localT;
    const b = lower.b + (upper.b - lower.b) * localT;

    // Calculate opacity based on intensity
    const opacity = 0.3 + (clamped / 10) * 0.65;

    return {
      color: new THREE.Color(r, g, b),
      opacity,
      rgb: { r, g, b }
    };
  }

  /**
   * Initialize the 3D scene, camera, renderer, and body model
   */
  async init() {
    try {
      this.setupScene();
      this.setupCamera();
      this.setupRenderer();
      this.setupLighting();
      this.setupControls();

      await this.createBodyModel();
      this.setupEventListeners();
      this.createUI();

      // Start animation loop
      this.clock.start();
      this.animate();

      // Load initial selection if provided
      if (this.options.initialSelection && this.options.initialSelection.length > 0) {
        this.loadInitialSelection();
      }

      return this;
    } catch (error) {
      console.error('BodyHeatmap3DNew: Initialization failed:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Setup Three.js scene
   */
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null; // Transparent for CSS gradient background
  }

  /**
   * Setup perspective camera
   */
  setupCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 0.5, 5);
    this.camera.lookAt(0, 0.5, 0);
  }

  /**
   * Setup WebGL renderer with error handling
   */
  setupRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });

      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.container.innerHTML = '';
      this.container.appendChild(this.renderer.domElement);
      this.container.style.position = 'relative';

      // WebGL context loss handling
      this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.warn('BodyHeatmap3DNew: WebGL context lost');
        this.isPaused = true;
      }, false);

      this.renderer.domElement.addEventListener('webglcontextrestored', () => {
        console.info('BodyHeatmap3DNew: WebGL context restored');
        this.isPaused = false;
        this.needsRender = true;
      }, false);

    } catch (error) {
      console.error('BodyHeatmap3DNew: WebGL renderer setup failed:', error);
      throw new Error('WebGL initialization failed. Your browser may not support WebGL.');
    }
  }

  /**
   * Setup scene lighting
   */
  setupLighting() {
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    // Main directional light (key light)
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 5, 5);
    mainLight.castShadow = true;
    this.scene.add(mainLight);

    // Fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 3, 5);
    this.scene.add(fillLight);

    // Rim light for edge definition
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, 3, -5);
    this.scene.add(rimLight);
  }

  /**
   * Setup OrbitControls for rotation and zoom
   */
  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 10;
    this.controls.maxPolarAngle = Math.PI / 1.5;
    this.controls.enablePan = false;
  }

  /**
   * Create procedural low-poly human body model with separate body part meshes
   */
  async createBodyModel() {
    // Remove existing model
    if (this.bodyModel.children.length > 0) {
      this.bodyModel.clear();
      this.bodyMeshes = [];
      this.regionMeshMap.clear();
      this.meshRegionMap.clear();
    }

    const isFemale = this.gender === 'female';

    // Gender-specific proportions
    const proportions = {
      shoulderWidth: isFemale ? 0.65 : 0.75,
      hipWidth: isFemale ? 0.55 : 0.45,
      waistScale: isFemale ? 0.85 : 1.0,
      chestDepth: isFemale ? 0.38 : 0.35,
      armThickness: isFemale ? 0.085 : 0.1,
      thighWidth: isFemale ? 0.14 : 0.13,
      hipOffset: isFemale ? 0.28 : 0.22
    };

    // Create all body parts
    const bodyParts = this.createBodyGeometry(proportions);

    // Add all parts to the body model group
    bodyParts.forEach(part => {
      this.bodyModel.add(part.mesh);
      this.bodyMeshes.push(part.mesh);

      // Map mesh to region
      if (part.regionId) {
        this.meshRegionMap.set(part.mesh.name, part.regionId);

        if (!this.regionMeshMap.has(part.regionId)) {
          this.regionMeshMap.set(part.regionId, []);
        }
        this.regionMeshMap.get(part.regionId).push(part.mesh.name);
      }
    });

    // Position and scale the complete model
    this.bodyModel.position.set(0, 0, 0);
    this.bodyModel.scale.set(1, 1, 1);

    this.scene.add(this.bodyModel);
  }

  /**
   * Generate procedural body geometry using primitives with gender variants
   * Each body part is a SEPARATE MESH with unique name
   */
  createBodyGeometry(proportions) {
    const parts = [];
    const isDark = this.isDarkMode;
    const baseColor = isDark ? 0x2a3a3a : 0xe8f0ec;

    // === FRONT VIEW MESHES ===

    // Head (front) - Sphere
    const headFront = this.createMesh(
      'head-front',
      'head-front',
      new THREE.SphereGeometry(0.32, 32, 32),
      baseColor,
      new THREE.Vector3(0, 1.75, 0.15)
    );
    parts.push(headFront);

    // Face - Smaller sphere on front of head
    const face = this.createMesh(
      'face',
      'face',
      new THREE.SphereGeometry(0.28, 24, 24),
      baseColor,
      new THREE.Vector3(0, 1.72, 0.28)
    );
    face.scale.set(1, 0.9, 0.5);
    parts.push(face);

    // Jaw - Torus segment
    const jaw = this.createMesh(
      'jaw',
      'jaw',
      new THREE.TorusGeometry(0.12, 0.06, 16, 24, Math.PI),
      baseColor,
      new THREE.Vector3(0, 1.55, 0.25)
    );
    jaw.rotation.x = Math.PI;
    parts.push(jaw);

    // Neck (front) - Cylinder
    const neckFront = this.createMesh(
      'neck-front',
      'neck-front',
      new THREE.CylinderGeometry(0.1, 0.12, 0.15, 16),
      baseColor,
      new THREE.Vector3(0, 1.45, 0.05)
    );
    parts.push(neckFront);

    // Chest - Box with rounded edges
    const chest = this.createMesh(
      'chest',
      'chest',
      new THREE.BoxGeometry(proportions.shoulderWidth, 0.45, proportions.chestDepth),
      baseColor,
      new THREE.Vector3(0, 1.15, 0)
    );
    parts.push(chest);

    // Abdomen - Box
    const abdomen = this.createMesh(
      'abdomen',
      'abdomen',
      new THREE.BoxGeometry(proportions.hipWidth * proportions.waistScale, 0.4, 0.25),
      baseColor,
      new THREE.Vector3(0, 0.75, 0)
    );
    parts.push(abdomen);

    // Pelvis - Box
    const pelvis = this.createMesh(
      'pelvis',
      'pelvis',
      new THREE.BoxGeometry(proportions.hipWidth, 0.25, 0.2),
      baseColor,
      new THREE.Vector3(0, 0.45, 0)
    );
    parts.push(pelvis);

    // === UPPER LIMBS (FRONT) ===
    parts.push(...this.createFrontArm('left', proportions, baseColor));
    parts.push(...this.createFrontArm('right', proportions, baseColor));

    // === LOWER LIMBS (FRONT) ===
    parts.push(...this.createFrontLeg('left', proportions, baseColor));
    parts.push(...this.createFrontLeg('right', proportions, baseColor));

    // === BACK VIEW MESHES ===

    // Head (back) - Hemisphere on back of head
    const headBack = this.createMesh(
      'head-back',
      'head-back',
      new THREE.SphereGeometry(0.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      baseColor,
      new THREE.Vector3(0, 1.75, -0.15)
    );
    headBack.rotation.y = Math.PI;
    parts.push(headBack);

    // Neck (back) - Cylinder
    const neckBack = this.createMesh(
      'neck-back',
      'neck-back',
      new THREE.CylinderGeometry(0.1, 0.12, 0.15, 16),
      baseColor,
      new THREE.Vector3(0, 1.45, -0.1)
    );
    parts.push(neckBack);

    // Upper Back - Box
    const upperBack = this.createMesh(
      'upper-back',
      'upper-back',
      new THREE.BoxGeometry(proportions.shoulderWidth + 0.05, 0.35, 0.25),
      baseColor,
      new THREE.Vector3(0, 1.2, -0.12)
    );
    parts.push(upperBack);

    // Middle Back - Box
    const middleBack = this.createMesh(
      'middle-back',
      'middle-back',
      new THREE.BoxGeometry(proportions.shoulderWidth, 0.3, 0.22),
      baseColor,
      new THREE.Vector3(0, 0.85, -0.1)
    );
    parts.push(middleBack);

    // Lower Back - Box
    const lowerBack = this.createMesh(
      'lower-back',
      'lower-back',
      new THREE.BoxGeometry(0.55, 0.3, 0.2),
      baseColor,
      new THREE.Vector3(0, 0.55, -0.1)
    );
    parts.push(lowerBack);

    // Buttocks - Two spheres
    const buttocksLeft = this.createMesh(
      'buttocks-left',
      'buttocks',
      new THREE.SphereGeometry(0.16, 16, 16),
      baseColor,
      new THREE.Vector3(-0.18, 0.25, -0.15)
    );
    buttocksLeft.scale.set(1.1, 0.9, 0.8);
    parts.push(buttocksLeft);

    const buttocksRight = this.createMesh(
      'buttocks-right',
      'buttocks',
      new THREE.SphereGeometry(0.16, 16, 16),
      baseColor,
      new THREE.Vector3(0.18, 0.25, -0.15)
    );
    buttocksRight.scale.set(1.1, 0.9, 0.8);
    parts.push(buttocksRight);

    // === UPPER LIMBS (BACK) ===
    parts.push(...this.createBackArm('left', proportions, baseColor));
    parts.push(...this.createBackArm('right', proportions, baseColor));

    // === LOWER LIMBS (BACK) ===
    parts.push(...this.createBackLeg('left', proportions, baseColor));
    parts.push(...this.createBackLeg('right', proportions, baseColor));

    return parts;
  }

  /**
   * Helper to create a mesh with heatmap material
   */
  createMesh(regionId, name, geometry, baseColor, position) {
    const material = this.createHeatmapMaterial(baseColor);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.name = name;
    mesh.userData = { regionId, baseColor };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Create front arm parts (shoulder, upper arm, elbow, forearm, wrist, hand)
   */
  createFrontArm(side, proportions, baseColor) {
    const parts = [];
    const dir = side === 'left' ? -1 : 1;
    const shoulderX = dir * (proportions.shoulderWidth / 2 + 0.08);

    // Shoulder
    const shoulder = this.createMesh(
      `shoulder-${side}`,
      `shoulder-${side}`,
      new THREE.SphereGeometry(proportions.armThickness * 1.3, 16, 16),
      baseColor,
      new THREE.Vector3(shoulderX, 1.25, 0)
    );
    parts.push(shoulder);

    // Upper arm
    const upperArm = this.createMesh(
      `upper-arm-${side}`,
      `upper-arm-${side}`,
      new THREE.CylinderGeometry(proportions.armThickness, proportions.armThickness * 0.9, 0.45, 16),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.12), 1.0, 0.05)
    );
    upperArm.rotation.z = dir * 0.1;
    parts.push(upperArm);

    // Elbow
    const elbow = this.createMesh(
      `elbow-${side}`,
      `elbow-${side}`,
      new THREE.SphereGeometry(proportions.armThickness * 1.1, 16, 16),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.15), 0.75, 0.05)
    );
    parts.push(elbow);

    // Forearm
    const forearm = this.createMesh(
      `forearm-${side}`,
      `forearm-${side}`,
      new THREE.CylinderGeometry(proportions.armThickness * 0.85, proportions.armThickness * 0.75, 0.4, 16),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.17), 0.52, 0.05)
    );
    forearm.rotation.z = dir * 0.08;
    parts.push(forearm);

    // Wrist
    const wrist = this.createMesh(
      `wrist-${side}`,
      `wrist-${side}`,
      new THREE.CylinderGeometry(proportions.armThickness * 0.6, proportions.armThickness * 0.55, 0.1, 16),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.19), 0.3, 0.05)
    );
    parts.push(wrist);

    // Hand
    const hand = this.createMesh(
      `hand-${side}`,
      `hand-${side}`,
      new THREE.BoxGeometry(0.08, 0.12, 0.04),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.19), 0.18, 0.05)
    );
    parts.push(hand);

    return parts;
  }

  /**
   * Create back arm parts
   */
  createBackArm(side, proportions, baseColor) {
    const parts = [];
    const dir = side === 'left' ? -1 : 1;

    // Shoulder (back)
    const shoulderBack = this.createMesh(
      `shoulder-back-${side}`,
      `shoulder-back-${side}`,
      new THREE.SphereGeometry(proportions.armThickness * 1.2, 16, 16),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.05), 1.25, -0.1)
    );
    parts.push(shoulderBack);

    // Upper arm (back)
    const upperArmBack = this.createMesh(
      `upper-arm-back-${side}`,
      `upper-arm-back-${side}`,
      new THREE.CylinderGeometry(proportions.armThickness, proportions.armThickness * 0.9, 0.45, 16),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.1), 1.0, -0.05)
    );
    upperArmBack.rotation.z = dir * 0.1;
    parts.push(upperArmBack);

    // Elbow (back)
    const elbowBack = this.createMesh(
      `elbow-back-${side}`,
      `elbow-back-${side}`,
      new THREE.SphereGeometry(proportions.armThickness * 1.1, 16, 16),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.13), 0.75, -0.05)
    );
    parts.push(elbowBack);

    // Forearm (back)
    const forearmBack = this.createMesh(
      `forearm-back-${side}`,
      `forearm-back-${side}`,
      new THREE.CylinderGeometry(proportions.armThickness * 0.85, proportions.armThickness * 0.75, 0.4, 16),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.15), 0.52, -0.05)
    );
    forearmBack.rotation.z = dir * 0.08;
    parts.push(forearmBack);

    // Wrist (back)
    const wristBack = this.createMesh(
      `wrist-back-${side}`,
      `wrist-back-${side}`,
      new THREE.CylinderGeometry(proportions.armThickness * 0.6, proportions.armThickness * 0.55, 0.1, 16),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.17), 0.3, -0.05)
    );
    parts.push(wristBack);

    // Hand (back)
    const handBack = this.createMesh(
      `hand-back-${side}`,
      `hand-back-${side}`,
      new THREE.BoxGeometry(0.08, 0.12, 0.04),
      baseColor,
      new THREE.Vector3(dir * (proportions.shoulderWidth / 2 + 0.17), 0.18, -0.05)
    );
    parts.push(handBack);

    return parts;
  }

  /**
   * Create front leg parts (hip, upper leg, knee, lower leg, ankle, foot)
   */
  createFrontLeg(side, proportions, baseColor) {
    const parts = [];
    const dir = side === 'left' ? -1 : 1;

    // Hip
    const hip = this.createMesh(
      `hip-${side}`,
      `hip-${side}`,
      new THREE.SphereGeometry(proportions.thighWidth * 1.2, 16, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, 0.35, 0.05)
    );
    parts.push(hip);

    // Upper leg (thigh)
    const upperLeg = this.createMesh(
      `upper-leg-${side}`,
      `upper-leg-${side}`,
      new THREE.CylinderGeometry(proportions.thighWidth, proportions.thighWidth * 0.85, 0.55, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -0.1, 0.05)
    );
    parts.push(upperLeg);

    // Knee
    const knee = this.createMesh(
      `knee-${side}`,
      `knee-${side}`,
      new THREE.SphereGeometry(proportions.thighWidth * 0.9, 16, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -0.4, 0.05)
    );
    parts.push(knee);

    // Lower leg (calf)
    const lowerLeg = this.createMesh(
      `lower-leg-${side}`,
      `lower-leg-${side}`,
      new THREE.CylinderGeometry(proportions.thighWidth * 0.8, proportions.thighWidth * 0.6, 0.5, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -0.7, 0.05)
    );
    parts.push(lowerLeg);

    // Ankle
    const ankle = this.createMesh(
      `ankle-${side}`,
      `ankle-${side}`,
      new THREE.CylinderGeometry(proportions.thighWidth * 0.5, proportions.thighWidth * 0.45, 0.08, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -0.95, 0.05)
    );
    parts.push(ankle);

    // Foot
    const foot = this.createMesh(
      `foot-${side}`,
      `foot-${side}`,
      new THREE.BoxGeometry(0.1, 0.06, 0.18),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -1.02, 0.12)
    );
    parts.push(foot);

    return parts;
  }

  /**
   * Create back leg parts
   */
  createBackLeg(side, proportions, baseColor) {
    const parts = [];
    const dir = side === 'left' ? -1 : 1;

    // Hip (back)
    const hipBack = this.createMesh(
      `hip-back-${side}`,
      `hip-back-${side}`,
      new THREE.SphereGeometry(proportions.thighWidth * 1.1, 16, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, 0.35, -0.1)
    );
    parts.push(hipBack);

    // Upper leg (back) - hamstring
    const upperLegBack = this.createMesh(
      `upper-leg-back-${side}`,
      `upper-leg-back-${side}`,
      new THREE.CylinderGeometry(proportions.thighWidth, proportions.thighWidth * 0.85, 0.55, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -0.1, -0.08)
    );
    parts.push(upperLegBack);

    // Knee (back)
    const kneeBack = this.createMesh(
      `knee-back-${side}`,
      `knee-back-${side}`,
      new THREE.SphereGeometry(proportions.thighWidth * 0.85, 16, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -0.4, -0.08)
    );
    parts.push(kneeBack);

    // Lower leg (back) - calf
    const lowerLegBack = this.createMesh(
      `lower-leg-back-${side}`,
      `lower-leg-back-${side}`,
      new THREE.CylinderGeometry(proportions.thighWidth * 0.85, proportions.thighWidth * 0.6, 0.5, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -0.7, -0.06)
    );
    parts.push(lowerLegBack);

    // Ankle (back)
    const ankleBack = this.createMesh(
      `ankle-back-${side}`,
      `ankle-back-${side}`,
      new THREE.CylinderGeometry(proportions.thighWidth * 0.5, proportions.thighWidth * 0.45, 0.08, 16),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -0.95, -0.05)
    );
    parts.push(ankleBack);

    // Foot (back) - heel
    const footBack = this.createMesh(
      `foot-back-${side}`,
      `foot-back-${side}`,
      new THREE.BoxGeometry(0.09, 0.06, 0.12),
      baseColor,
      new THREE.Vector3(dir * proportions.hipOffset, -1.02, -0.05)
    );
    parts.push(footBack);

    return parts;
  }

  /**
   * Create shader material for heatmap visualization with medical gradient
   * Uses vertex colors for smooth interpolation across mesh surface
   */
  createHeatmapMaterial(baseColor) {
    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      uniform float uTime;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      uniform vec3 uBaseColor;
      uniform vec3 uHeatColor;
      uniform float uHeatIntensity;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uPulseIntensity;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec2 vUv;

      // Medical gradient: Blue → Cyan → Green → Yellow → Red
      vec3 getMedicalGradient(float t) {
        t = clamp(t, 0.0, 1.0);

        vec3 blue = vec3(0.0, 0.0, 1.0);
        vec3 cyan = vec3(0.0, 1.0, 1.0);
        vec3 green = vec3(0.0, 1.0, 0.0);
        vec3 yellow = vec3(1.0, 1.0, 0.0);
        vec3 red = vec3(1.0, 0.0, 0.0);

        if (t < 0.25) {
          return mix(blue, cyan, t / 0.25);
        } else if (t < 0.5) {
          return mix(cyan, green, (t - 0.25) / 0.25);
        } else if (t < 0.75) {
          return mix(green, yellow, (t - 0.5) / 0.25);
        } else {
          return mix(yellow, red, (t - 0.75) / 0.25);
        }
      }

      void main() {
        // Fresnel effect for rim lighting
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float fresnel = dot(viewDirection, vNormal);
        fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
        fresnel = pow(fresnel, 2.0);

        // Base color with normal shading
        float normalShading = dot(vNormal, vec3(0.5, 0.8, 1.0)) * 0.5 + 0.5;

        // Get medical gradient color based on intensity
        vec3 gradientColor = getMedicalGradient(uHeatIntensity);

        // Mix base with gradient color
        vec3 finalColor = mix(uBaseColor, gradientColor, uHeatIntensity * 0.85);

        // Add fresnel rim for depth
        finalColor = mix(finalColor, vec3(1.0), fresnel * 0.15);

        // Pulse animation for high intensity (>0.7)
        float pulse = 1.0;
        if (uPulseIntensity > 0.0) {
          float pulseWave = smoothstep(0.0, 1.0, sin(uTime * 3.0) * 0.5 + 0.5);
          pulse = 1.0 + pulseWave * 0.15 * uPulseIntensity;
        }

        // Apply opacity with pulse
        float finalOpacity = uOpacity * pulse;

        gl_FragColor = vec4(finalColor * normalShading, finalOpacity);
      }
    `;

    const baseColorVec = new THREE.Color(baseColor);

    const uniforms = {
      uBaseColor: { value: baseColorVec },
      uHeatColor: { value: new THREE.Color(1, 0, 0) },
      uHeatIntensity: { value: 0 },
      uOpacity: { value: 0.85 },
      uTime: { value: 0 },
      uPulseIntensity: { value: 0 }
    };

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
  }

  /**
   * Setup mouse and touch event listeners
   */
  setupEventListeners() {
    const canvas = this.renderer.domElement;

    // Mouse events
    canvas.addEventListener('click', this.onMouseClick);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseleave', this.onMouseLeave);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mouseup', this.onMouseUp);

    // Touch events
    canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    canvas.addEventListener('touchcancel', this.onTouchCancel.bind(this));

    // Window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Theme change observer
    this.themeObserver = new MutationObserver(() => {
      const newDarkMode = this.detectDarkMode();
      if (newDarkMode !== this.isDarkMode) {
        this.isDarkMode = newDarkMode;
        this.updateMaterialsForTheme();
      }
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    // Visibility change
    document.addEventListener('visibilitychange', () => {
      this.isPaused = document.hidden;
    });
  }

  /**
   * Handle mouse click for pain selection
   */
  onMouseClick(event) {
    if (this.controls.enabled && event.buttons === 2) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.bodyMeshes, true);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const regionId = mesh.userData.regionId;

      if (regionId && event.shiftKey) {
        this.handleRegionClick(regionId, -1);
      } else if (regionId) {
        this.handleRegionClick(regionId, 1);
      }
    }
  }

  /**
   * Handle mouse move for hover effects
   */
  onMouseMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.bodyMeshes, true);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      document.body.style.cursor = 'pointer';

      const regionId = mesh.userData.regionId;
      if (regionId) {
        this.hoveredRegion = regionId;
        this.showTooltip(regionId, event.clientX, event.clientY);

        // Hover highlight
        this.applyHoverHighlight(regionId, true);
      }
    } else {
      document.body.style.cursor = 'default';
      this.hoveredRegion = null;
      this.hideTooltip();
      this.clearHoverHighlight();
    }
  }

  /**
   * Handle mouse leave
   */
  onMouseLeave() {
    document.body.style.cursor = 'default';
    this.hideTooltip();
    this.clearHoldTimers();
    this.mouseDownRegion = null;
    this.hoveredRegion = null;
    this.clearHoverHighlight();
  }

  /**
   * Handle mouse down - start hold-to-increase
   */
  onMouseDown(event) {
    if (this.controls.enabled && event.buttons === 2) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.bodyMeshes, true);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const regionId = mesh.userData.regionId;

      if (regionId) {
        this.mouseDownRegion = regionId;
        this.holdTimer = setTimeout(() => {
          this.startHoldAcceleration(regionId);
        }, this.holdThreshold);
      }
    }
  }

  /**
   * Handle mouse up - finalize click or stop hold-to-increase
   */
  onMouseUp(event) {
    this.clearHoldTimers();

    if (this.mouseDownRegion && !this.holdTriggered) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.bodyMeshes, true);

      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const regionId = mesh.userData.regionId;
        if (regionId === this.mouseDownRegion) {
          if (event.shiftKey) {
            this.handleRegionClick(regionId, -1);
          } else {
            this.handleRegionClick(regionId, 1);
          }
        }
      }
    }
    this.holdTriggered = false;
    this.mouseDownRegion = null;
  }

  /**
   * Handle touch start
   */
  onTouchStart(event) {
    event.preventDefault();
    const touch = event.touches[0];
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.bodyMeshes, true);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const regionId = mesh.userData.regionId;

      if (regionId) {
        this.holdTimer = setTimeout(() => {
          this.startHoldAcceleration(regionId);
        }, this.holdThreshold);
      }
    }
  }

  /**
   * Handle touch end
   */
  onTouchEnd(event) {
    this.clearHoldTimers();

    if (!this.holdTriggered) {
      const touch = event.changedTouches[0];
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.bodyMeshes, true);

      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const regionId = mesh.userData.regionId;
        if (regionId) {
          this.handleRegionClick(regionId, 1);
        }
      }
    }
    this.holdTriggered = false;
  }

  /**
   * Handle touch cancel
   */
  onTouchCancel() {
    this.clearHoldTimers();
    this.holdTriggered = false;
  }

  /**
   * Handle window resize
   */
  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Handle region click with hold-to-increase behavior
   */
  handleRegionClick(regionId, delta = 1) {
    const currentData = this.selectedRegions.get(regionId);
    let currentIntensity = currentData?.intensity || 0;

    let newIntensity = currentIntensity + delta;
    newIntensity = Math.max(0, Math.min(this.maxIntensity, newIntensity));

    if (newIntensity <= 0.01) {
      this.selectedRegions.delete(regionId);
      newIntensity = 0;
    } else {
      const regionData = this.regions[regionId];
      this.selectedRegions.set(regionId, {
        intensity: newIntensity,
        name: regionData?.name || regionId,
        side: regionData?.side || 'front'
      });
    }

    this.applyIntensityVisual(regionId, newIntensity);
    this.updateSummaryDisplay();
    this.options.onSelectionChange(this.getSelectedData());
  }

  /**
   * Start hold acceleration for continuous intensity increase
   */
  startHoldAcceleration(regionId) {
    this.holdTriggered = true;
    this.holdInterval = setInterval(() => {
      const currentData = this.selectedRegions.get(regionId);
      const currentIntensity = currentData?.intensity || 0;

      if (currentIntensity < this.maxIntensity) {
        this.handleRegionClick(regionId, 1);
      } else {
        this.clearHoldTimers();
      }
    }, this.holdAcceleration);
  }

  /**
   * Clear hold timers
   */
  clearHoldTimers() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.holdInterval) {
      clearInterval(this.holdInterval);
      this.holdInterval = null;
    }
  }

  /**
   * Apply visual intensity to region using shader uniforms
   */
  applyIntensityVisual(regionId, intensity) {
    const regionData = this.regions[regionId];
    if (!regionData) return;

    const colorData = this.getMedicalColor(intensity);
    if (!colorData) {
      // Reset to base
      regionData.meshes.forEach(meshName => {
        const mesh = this.bodyModel.getObjectByName(meshName);
        if (mesh && mesh.material.uniforms) {
          mesh.material.uniforms.uHeatIntensity.value = 0;
          mesh.material.uniforms.uPulseIntensity.value = 0;
        }
      });
      return;
    }

    const opacity = colorData.opacity;

    // Update all meshes for this region
    regionData.meshes.forEach(meshName => {
      const mesh = this.bodyModel.getObjectByName(meshName);
      if (mesh && mesh.material.uniforms) {
        const uniforms = mesh.material.uniforms;
        uniforms.uHeatColor.value = colorData.color;
        uniforms.uHeatIntensity.value = intensity / 10;
        uniforms.uOpacity.value = opacity;
        uniforms.uPulseIntensity.value = intensity > 7 ? (intensity - 7) / 3 : 0;
      }
    });
  }

  /**
   * Apply hover highlight effect
   */
  applyHoverHighlight(regionId, isHovering) {
    const regionData = this.regions[regionId];
    if (!regionData) return;

    regionData.meshes.forEach(meshName => {
      const mesh = this.bodyModel.getObjectByName(meshName);
      if (mesh && mesh.material.uniforms) {
        // Slight emissive boost on hover
        const baseEmissive = isHovering ? 0.15 : 0;
        // Note: ShaderMaterial doesn't have emissive, so we adjust opacity slightly
        mesh.material.uniforms.uOpacity.value += isHovering ? 0.1 : 0;
      }
    });
  }

  /**
   * Clear hover highlight
   */
  clearHoverHighlight() {
    this.bodyMeshes.forEach(mesh => {
      if (mesh && mesh.material.uniforms) {
        const regionId = mesh.userData.regionId;
        const intensity = this.selectedRegions.get(regionId)?.intensity || 0;
        const colorData = this.getMedicalColor(intensity);
        if (mesh.material.uniforms.uOpacity) {
          mesh.material.uniforms.uOpacity.value = colorData ? colorData.opacity : 0.85;
        }
      }
    });
  }

  /**
   * Show intensity tooltip
   */
  showTooltip(regionId, clientX, clientY) {
    const regionData = this.regions[regionId];
    const intensity = this.selectedRegions.get(regionId)?.intensity || 0;

    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'intensity-tooltip-3d-new';
      this.tooltip.style.cssText = `
        position: fixed;
        background: ${this.isDarkMode ? 'rgba(10, 20, 15, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${this.isDarkMode ? 'rgba(255,255,255,0.15)' : '#ddddd0'};
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 0.8rem;
        font-weight: 600;
        font-family: 'DM Sans', sans-serif;
        color: ${this.isDarkMode ? '#e8f4ef' : '#1a1a18'};
        pointer-events: none;
        z-index: 1000;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: opacity 0.2s ease;
      `;
      document.body.appendChild(this.tooltip);
    }

    this.tooltip.textContent = `${regionData.name}: ${intensity.toFixed(1)}/10`;
    this.tooltip.style.left = `${clientX + 15}px`;
    this.tooltip.style.top = `${clientY + 15}px`;
    this.tooltip.style.opacity = '1';
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.opacity = '0';
      setTimeout(() => {
        if (this.tooltip && this.tooltip.parentNode) {
          this.tooltip.remove();
        }
      }, 200);
      this.tooltip = null;
    }
  }

  /**
   * Create UI controls panel
   */
  createUI() {
    const isDark = this.isDarkMode;
    const glassBg = isDark ? 'rgba(15, 35, 25, 0.75)' : 'rgba(255, 255, 255, 0.75)';
    const borderColor = isDark ? 'rgba(255,255,255,0.15)' : '#ddddd0';
    const textColor = isDark ? '#e8f4ef' : '#1a1a18';
    const mutedColor = isDark ? '#a8b5a0' : '#6b6b60';

    const uiContainer = document.createElement('div');
    uiContainer.className = 'body-heatmap-3d-new-ui';
    uiContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100;
    `;

    // Gender toggle
    const genderToggle = document.createElement('div');
    genderToggle.style.cssText = `
      display: flex;
      gap: 4px;
      background: ${glassBg};
      backdrop-filter: blur(20px);
      border: 1px solid ${borderColor};
      border-radius: 10px;
      padding: 4px;
    `;

    const genders = [
      { id: 'male', label: 'M' },
      { id: 'female', label: 'F' }
    ];

    genders.forEach(g => {
      const btn = document.createElement('button');
      btn.textContent = g.label;
      btn.dataset.gender = g.id;
      btn.className = g.id === this.gender ? 'active' : '';
      btn.style.cssText = `
        padding: 6px 10px;
        border: none;
        border-radius: 6px;
        background: ${g.id === this.gender ? 'var(--green, #1a6b4a)' : 'transparent'};
        color: ${g.id === this.gender ? 'white' : mutedColor};
        font-family: 'DM Sans', sans-serif;
        font-size: 0.7rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      `;
      btn.onmouseover = () => { if (!btn.classList.contains('active')) btn.style.background = 'rgba(26, 107, 74, 0.1)'; };
      btn.onmouseout = () => { if (!btn.classList.contains('active')) btn.style.background = 'transparent'; };
      btn.onclick = () => this.setGender(g.id);
      genderToggle.appendChild(btn);
    });

    uiContainer.appendChild(genderToggle);

    // View toggle
    const viewToggle = document.createElement('div');
    viewToggle.style.cssText = `
      display: flex;
      gap: 6px;
      background: ${glassBg};
      backdrop-filter: blur(20px);
      border: 1px solid ${borderColor};
      border-radius: 10px;
      padding: 4px;
    `;

    const views = [
      { id: 'front', label: 'Front' },
      { id: 'back', label: 'Back' },
      { id: '360', label: '360°' }
    ];

    views.forEach(view => {
      const btn = document.createElement('button');
      btn.textContent = view.label;
      btn.dataset.view = view.id;
      btn.className = view.id === this.currentView ? 'active' : '';
      btn.style.cssText = `
        padding: 6px 12px;
        border: none;
        border-radius: 6px;
        background: ${view.id === this.currentView ? 'var(--green, #1a6b4a)' : 'transparent'};
        color: ${view.id === this.currentView ? 'white' : mutedColor};
        font-family: 'DM Sans', sans-serif;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      `;
      btn.onmouseover = () => { if (!btn.classList.contains('active')) btn.style.background = 'rgba(26, 107, 74, 0.1)'; };
      btn.onmouseout = () => { if (!btn.classList.contains('active')) btn.style.background = 'transparent'; };
      btn.onclick = () => this.setView(view.id);
      viewToggle.appendChild(btn);
    });

    uiContainer.appendChild(viewToggle);

    // Action buttons
    const actionRow = document.createElement('div');
    actionRow.style.cssText = `
      display: flex;
      gap: 6px;
      background: ${glassBg};
      backdrop-filter: blur(20px);
      border: 1px solid ${borderColor};
      border-radius: 10px;
      padding: 6px;
    `;

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = `
      padding: 8px 14px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: ${mutedColor};
      font-family: 'DM Sans', sans-serif;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    resetBtn.onmouseover = () => resetBtn.style.color = 'var(--red, #c0392b)';
    resetBtn.onmouseout = () => resetBtn.style.color = mutedColor;
    resetBtn.onclick = () => this.clear();

    actionRow.appendChild(resetBtn);
    uiContainer.appendChild(actionRow);

    // Selected regions summary
    const summaryContainer = document.createElement('div');
    summaryContainer.id = 'selected-regions-3d-new-summary';
    summaryContainer.style.cssText = `
      background: ${glassBg};
      backdrop-filter: blur(20px);
      border: 1px solid ${borderColor};
      border-radius: 12px;
      padding: 10px;
      min-height: 60px;
      max-height: 150px;
      overflow-y: auto;
    `;

    const summaryTitle = document.createElement('div');
    summaryTitle.style.cssText = `
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${mutedColor};
      margin-bottom: 8px;
    `;
    summaryTitle.textContent = 'Selected Areas';

    const summaryChips = document.createElement('div');
    summaryChips.id = 'summary-chips-3d-new';
    summaryChips.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    `;

    summaryContainer.appendChild(summaryTitle);
    summaryContainer.appendChild(summaryChips);
    uiContainer.appendChild(summaryContainer);

    this.container.appendChild(uiContainer);

    // Add legend
    const legendContainer = document.createElement('div');
    legendContainer.className = 'heatmap-legend-3d-new';
    legendContainer.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: ${glassBg};
      backdrop-filter: blur(20px);
      border: 1px solid ${borderColor};
      border-radius: 12px;
      padding: 10px 14px;
      min-width: 280px;
    `;

    const legendTitle = document.createElement('div');
    legendTitle.style.cssText = `
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${mutedColor};
      margin-bottom: 6px;
      text-align: center;
    `;
    legendTitle.textContent = 'Pain Intensity (Medical Scale 0-10)';

    const legendBar = document.createElement('div');
    legendBar.style.cssText = `
      width: 100%;
      height: 16px;
      border-radius: 8px;
      background: linear-gradient(to right,
        rgb(0, 0, 255) 0%,
        rgb(0, 255, 255) 25%,
        rgb(0, 255, 0) 50%,
        rgb(255, 255, 0) 75%,
        rgb(255, 0, 0) 100%
      );
      border: 1px solid ${borderColor};
    `;

    const legendLabels = document.createElement('div');
    legendLabels.style.cssText = `
      display: flex;
      justify-content: space-between;
      font-size: 0.6rem;
      font-weight: 600;
      color: ${mutedColor};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    `;
    legendLabels.innerHTML = '<span>None</span><span>Mild</span><span>Moderate</span><span>Severe</span><span>Extreme</span>';

    legendContainer.appendChild(legendTitle);
    legendContainer.appendChild(legendBar);
    legendContainer.appendChild(legendLabels);

    this.container.appendChild(legendContainer);
  }

  /**
   * Update summary display
   */
  updateSummaryDisplay() {
    const chipsContainer = document.getElementById('summary-chips-3d-new');
    const summaryContainer = document.getElementById('selected-regions-3d-new-summary');

    if (!chipsContainer || !summaryContainer) return;

    if (this.selectedRegions.size === 0) {
      summaryContainer.style.display = 'none';
      return;
    }

    summaryContainer.style.display = 'block';
    const isDark = this.isDarkMode;
    const borderColor = isDark ? 'rgba(255,255,255,0.15)' : '#ddddd0';

    chipsContainer.innerHTML = Array.from(this.selectedRegions.entries())
      .map(([regionId, data]) => {
        const regionData = this.regions[regionId];
        if (!regionData) return '';

        const intensity = data.intensity;
        const colorData = this.getMedicalColor(intensity);
        const color = colorData ? this.intensityToColorString(colorData) : '#ccc';
        const filledSegments = Math.ceil(intensity / 2);

        return `
          <div class="summary-chip-3d-new" data-region="${regionId}" style="
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 16px;
            font-size: 0.7rem;
            font-weight: 500;
            font-family: 'DM Sans', sans-serif;
            background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)'};
            border: 1px solid ${color};
            transition: all 0.2s ease;
          ">
            <span style="color: ${color}">${regionData.name}</span>
            <div style="display: flex; gap: 1px;">
              ${Array.from({ length: 5 }, (_, i) => `
                <span style="
                  width: 3px;
                  height: 10px;
                  border-radius: 1px;
                  background: ${i < filledSegments ? color : 'rgba(100,100,100,0.2)'};
                "></span>
              `).join('')}
            </div>
            <span style="font-size: 0.65rem; font-weight: 700; min-width: 24px; text-align: right; color: ${isDark ? '#a8b5a0' : '#6b6b60'}">${intensity.toFixed(1)}</span>
            <button class="chip-remove-3d-new" data-region="${regionId}" style="
              background: none;
              border: none;
              cursor: pointer;
              color: ${isDark ? '#a8b5a0' : '#6b6b60'};
              font-size: 0.9rem;
              padding: 0 2px;
              line-height: 1;
            ">&times;</button>
          </div>
        `;
      }).join('');

    // Attach remove listeners
    chipsContainer.querySelectorAll('.chip-remove-3d-new').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const regionId = e.currentTarget.dataset.region;
        this.selectedRegions.delete(regionId);
        this.applyIntensityVisual(regionId, 0);
        this.updateSummaryDisplay();
        this.options.onSelectionChange(this.getSelectedData());
      });
    });
  }

  /**
   * Convert color data to CSS color string
   */
  intensityToColorString(colorData) {
    const { r, g, b } = colorData.rgb;
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }

  /**
   * Set view (front, back, 360)
   */
  setView(view) {
    this.currentView = view;

    // Update button states
    const buttons = this.container.querySelectorAll('[data-view]');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
      if (btn.dataset.view === view) {
        btn.style.background = 'var(--green, #1a6b4a)';
        btn.style.color = 'white';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = this.isDarkMode ? '#a8b5a0' : '#6b6b60';
      }
    });

    // Set camera position based on view
    if (view === 'front') {
      this.camera.position.set(0, 0.5, 5);
      this.controls.autoRotate = false;
    } else if (view === 'back') {
      this.camera.position.set(0, 0.5, -5);
      this.controls.autoRotate = false;
    } else if (view === '360') {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 2.0;
    }
  }

  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(this.animate);

    if (this.isPaused) return;

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    this.controls.update();

    // Update shader uniforms for pulse animation
    this.bodyMeshes.forEach(mesh => {
      if (mesh.material.uniforms) {
        mesh.material.uniforms.uTime.value = elapsed;
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Load initial selection
   */
  loadInitialSelection() {
    if (this.options.initialSelection && this.options.initialSelection.length > 0) {
      this.options.initialSelection.forEach(selection => {
        if (selection.area && selection.intensity) {
          const regionData = this.regions[selection.area];
          this.selectedRegions.set(selection.area, {
            intensity: selection.intensity,
            name: regionData?.name || selection.area,
            side: regionData?.side || 'front'
          });
          this.applyIntensityVisual(selection.area, selection.intensity);
        }
      });
      this.updateSummaryDisplay();
    }
  }

  /**
   * Update materials when theme changes
   */
  updateMaterialsForTheme() {
    const isDark = this.isDarkMode;
    const baseColor = isDark ? 0x2a3a3a : 0xe8f0ec;
    const baseColorVec = new THREE.Color(baseColor);

    this.bodyMeshes.forEach(mesh => {
      if (mesh.material.uniforms) {
        mesh.material.uniforms.uBaseColor.value = baseColorVec;
      }
    });

    // Rebuild UI with new theme colors
    const oldUI = this.container.querySelector('.body-heatmap-3d-new-ui');
    if (oldUI) {
      oldUI.remove();
      this.createUI();
      this.updateSummaryDisplay();
    }

    const oldLegend = this.container.querySelector('.heatmap-legend-3d-new');
    if (oldLegend) {
      oldLegend.remove();
      this.createUI();
    }
  }

  /**
   * Set gender and rebuild body model
   */
  setGender(gender) {
    if (gender === this.gender) return;
    this.gender = gender;

    const currentSelections = this.getSelectedData();

    this.bodyModel.clear();
    this.bodyMeshes = [];
    this.regionMeshMap.clear();
    this.meshRegionMap.clear();

    this.createBodyModel().then(() => {
      this.setRegions(currentSelections);
    });
  }

  /**
   * Get selected data in standard format
   */
  getSelectedData() {
    return Array.from(this.selectedRegions.entries()).map(([area, data]) => ({
      area,
      intensity: data.intensity,
      name: data.name,
      side: data.side
    }));
  }

  /**
   * Get intensity for a specific region
   */
  getIntensity(regionId) {
    const data = this.selectedRegions.get(regionId);
    if (!data) return 0;
    return data.intensity;
  }

  /**
   * Set intensity for a specific region
   */
  setIntensity(regionId, intensity) {
    const clamped = Math.max(0, Math.min(this.maxIntensity, intensity));
    const regionData = this.regions[regionId];

    if (clamped <= 0) {
      this.selectedRegions.delete(regionId);
    } else {
      this.selectedRegions.set(regionId, {
        intensity: clamped,
        name: regionData?.name || regionId,
        side: regionData?.side || 'front'
      });
    }

    this.applyIntensityVisual(regionId, clamped);
    this.updateSummaryDisplay();
    this.options.onSelectionChange(this.getSelectedData());
  }

  /**
   * Set multiple regions at once (for state sync when switching modes)
   */
  setRegions(regions) {
    this.selectedRegions.clear();

    // Reset all mesh visuals to base state
    this.bodyMeshes.forEach(mesh => {
      if (mesh.material.uniforms) {
        mesh.material.uniforms.uHeatIntensity.value = 0;
        mesh.material.uniforms.uOpacity.value = 0.85;
        mesh.material.uniforms.uPulseIntensity.value = 0;
      }
    });

    // Apply new regions
    if (regions && regions.length > 0) {
      regions.forEach(region => {
        if (region.area && region.intensity > 0) {
          const regionData = this.regions[region.area];
          this.selectedRegions.set(region.area, {
            intensity: Math.max(0, Math.min(this.maxIntensity, region.intensity)),
            name: regionData?.name || region.area,
            side: regionData?.side || 'front'
          });
          this.applyIntensityVisual(region.area, region.intensity);
        }
      });
    }

    this.updateSummaryDisplay();
    return this;
  }

  /**
   * Alias for setRegions - for HeatmapSwitcher compatibility
   */
  setSelections(regions) {
    return this.setRegions(regions);
  }

  /**
   * Clear all selections
   */
  clear() {
    this.selectedRegions.clear();

    this.bodyMeshes.forEach(mesh => {
      if (mesh.material.uniforms) {
        mesh.material.uniforms.uHeatIntensity.value = 0;
        mesh.material.uniforms.uOpacity.value = 0.85;
        mesh.material.uniforms.uPulseIntensity.value = 0;
      }
    });

    this.updateSummaryDisplay();
    this.options.onSelectionChange([]);
  }

  /**
   * Get enhanced format (matches 2D version API)
   */
  getEnhancedFormat() {
    const selections = this.getSelectedData();
    if (selections.length === 0) return null;

    const maxIntensity = Math.max(...selections.map(s => s.intensity));
    const primaryArea = selections.find(s => s.intensity === maxIntensity)?.area || selections[0].area;

    return {
      regions: selections,
      primaryArea,
      maxIntensity,
      totalRegions: selections.length,
      averageIntensity: selections.reduce((sum, s) => sum + s.intensity, 0) / selections.length,
      legacy: {
        selectedBody: this.getLegacyFormat(),
        painLevel: maxIntensity
      }
    };
  }

  /**
   * Get legacy format for API compatibility
   */
  getLegacyFormat() {
    const selections = this.getSelectedData();
    if (selections.length === 0) return '';

    const maxIntensity = Math.max(...selections.map(s => s.intensity));
    const primary = selections.find(s => s.intensity === maxIntensity);

    const areaMap = {
      'head-front': 'head / nervous',
      'face': 'head / nervous',
      'jaw': 'head / nervous',
      'neck-front': 'neck',
      'neck-back': 'neck',
      'chest': 'chest / lungs',
      'abdomen': 'stomach / gut',
      'pelvis': 'pelvis / groin',
      'upper-back': 'back',
      'middle-back': 'back',
      'lower-back': 'back',
      'buttocks': 'buttocks',
      'shoulder-left': 'shoulder',
      'shoulder-right': 'shoulder',
      'shoulder-back-left': 'shoulder',
      'shoulder-back-right': 'shoulder',
      'upper-arm-left': 'arms / hands',
      'upper-arm-right': 'arms / hands',
      'upper-arm-back-left': 'arms / hands',
      'upper-arm-back-right': 'arms / hands',
      'forearm-left': 'arms / hands',
      'forearm-right': 'arms / hands',
      'forearm-back-left': 'arms / hands',
      'forearm-back-right': 'arms / hands',
      'hand-left': 'arms / hands',
      'hand-right': 'arms / hands',
      'hand-back-left': 'arms / hands',
      'hand-back-right': 'arms / hands',
      'hip-left': 'hips',
      'hip-right': 'hips',
      'upper-leg-left': 'legs / feet',
      'upper-leg-right': 'legs / feet',
      'upper-leg-back-left': 'legs / feet',
      'upper-leg-back-right': 'legs / feet',
      'lower-leg-left': 'legs / feet',
      'lower-leg-right': 'legs / feet',
      'lower-leg-back-left': 'legs / feet',
      'lower-leg-back-right': 'legs / feet',
      'foot-left': 'legs / feet',
      'foot-right': 'legs / feet',
      'foot-back-left': 'legs / feet',
      'foot-back-right': 'legs / feet'
    };

    return areaMap[primary?.area] || 'other / unsure';
  }

  /**
   * Export data with timestamp
   */
  async exportData() {
    return {
      timestamp: new Date().toISOString(),
      view: this.currentView,
      gender: this.gender,
      selections: this.getSelectedData(),
      summary: this.getEnhancedFormat()
    };
  }

  /**
   * Cleanup and dispose
   */
  dispose() {
    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }

    this.clearHoldTimers();

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('click', this.onMouseClick);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseleave', this.onMouseLeave);
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mouseup', this.onMouseUp);

    this.bodyMeshes.forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.bodyModel = null;
    this.bodyMeshes = [];
  }

  /**
   * Alias for dispose() - for HeatmapSwitcher compatibility
   * Allows cleanup() to be called interchangeably with dispose()
   */
  cleanup() {
    this.dispose();
  }
}

// Export for ES modules
export { BodyHeatmap3DNew };

// Auto-initialize if data attribute present
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const containers = document.querySelectorAll('[data-body-heatmap-3d-new]');
    containers.forEach(async (container) => {
      const heatmap = new BodyHeatmap3DNew(container.id, {
        onSelectionChange: (data) => {
          window.mediscanBodySelections3DNew = data;
        }
      });
      await heatmap.init();
      window.mediscanBodyHeatmap3DNew = heatmap;
    });
  });
}
