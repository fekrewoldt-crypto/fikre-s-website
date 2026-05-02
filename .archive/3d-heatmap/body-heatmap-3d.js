/**
 * MediScan 3D Body Heatmap Component
 * A Three.js-based interactive 3D body visualization with continuous intensity-based heatmap overlay
 *
 * Features:
 * - Procedurally generated stylized low-poly human figure (no external models required)
 * - Clickable anatomical regions with continuous 0-10 intensity scale
 * - Click-to-add, hold-to-increase (acceleration), Shift+click-to-decrease
 * - Smooth HSL color interpolation (yellow → orange → red → purple)
 * - Shader-based heatmap visualization with pulse animation for high-intensity regions
 * - OrbitControls for 360° rotation and zoom
 * - Raycasting for precise click detection on body regions
 * - Medical-grade glassmorphism UI matching MediScan aesthetic
 * - Touch-friendly and mobile-responsive
 * - Same region IDs and export formats as 2D version for compatibility
 *
 * @version 1.0.0
 * @author MediScan Team
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class BodyHeatmap3D {
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
    this.regionMaterials = new Map(); // Store original materials

    // State management - matches 2D version structure
    this.currentView = 'front'; // 'front', 'back', '360'
    this.selectedRegions = new Map(); // regionId -> { intensity: 0-10, points: [] }

    // Gender toggle for body shape variants
    this.gender = 'male'; // 'male' or 'female'

    // Hold-to-increase timing (matches 2D behavior)
    this.holdTimer = null;
    this.holdInterval = null;
    this.holdThreshold = 200; // ms before acceleration starts
    this.holdAcceleration = 150; // ms between intensity increases
    this.holdTriggered = false;
    this.mouseDownRegion = null; // Track region under mouse for hold-to-increase
    this.maxIntensity = 10;

    // Mobile detection for performance optimizations
    this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.needsRender = true; // Render on demand for performance
    this.isPaused = false; // Tab visibility state

    // Animation
    this.clock = new THREE.Clock();
    this.pulseUniforms = new Map(); // Store shader uniforms for pulsing

    // WebGL context loss handling
    this.webglLost = false;

    // UI elements
    this.tooltip = null;
    this.isDarkMode = this.detectDarkMode();

    // Define anatomical regions (same IDs as 2D version)
    this.regions = this.defineRegions();

    // Bind methods
    this.onMouseClick = this.onMouseClick.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);
    this.animate = this.animate.bind(this);
  }

  /**
   * Define anatomical regions with consistent IDs matching 2D version
   */
  defineRegions() {
    return {
      // Front view regions
      'head-face': {
        id: 'head-face',
        name: 'Head / Face',
        category: 'front',
        meshes: ['head']
      },
      'eyes': {
        id: 'eyes',
        name: 'Eyes',
        category: 'front',
        meshes: ['eyes']
      },
      'throat-mouth': {
        id: 'throat-mouth',
        name: 'Throat / Mouth',
        category: 'front',
        meshes: ['throat']
      },
      'chest-lungs': {
        id: 'chest-lungs',
        name: 'Chest / Lungs',
        category: 'front',
        meshes: ['chest']
      },
      'stomach-gut': {
        id: 'stomach-gut',
        name: 'Stomach / Gut',
        category: 'front',
        meshes: ['abdomen']
      },
      'arms-hands': {
        id: 'arms-hands',
        name: 'Arms / Hands',
        category: 'front',
        meshes: ['arm-left-upper', 'arm-left-lower', 'arm-right-upper', 'arm-right-lower', 'hand-left', 'hand-right']
      },
      'legs-feet': {
        id: 'legs-feet',
        name: 'Legs / Feet',
        category: 'front',
        meshes: ['leg-left-upper', 'leg-left-lower', 'leg-right-upper', 'leg-right-lower', 'foot-left', 'foot-right']
      },
      // Back view regions
      'back-upper': {
        id: 'back-upper',
        name: 'Upper Back',
        category: 'back',
        meshes: ['upper-back']
      },
      'back-lower': {
        id: 'back-lower',
        name: 'Lower Back',
        category: 'back',
        meshes: ['lower-back']
      },
      'back-neck': {
        id: 'back-neck',
        name: 'Neck / Shoulders',
        category: 'back',
        meshes: ['neck-back']
      },
      'back-head': {
        id: 'back-head',
        name: 'Back of Head',
        category: 'back',
        meshes: ['head-back']
      },
      'buttocks': {
        id: 'buttocks',
        name: 'Buttocks / Hips',
        category: 'back',
        meshes: ['glute-left', 'glute-right']
      },
      'legs-back': {
        id: 'legs-back',
        name: 'Legs Back (Hamstrings/Calves)',
        category: 'back',
        meshes: ['hamstring-left', 'hamstring-right', 'calf-back-left', 'calf-back-right', 'heel-left', 'heel-right']
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
   * Map intensity (0-10) to HSL color - matches 2D version exactly
   * 0-3: Yellow (#FFE135) → Orange (#FF9500)
   * 3-7: Orange (#FF9500) → Red (#DC143C)
   * 7-10: Red (#DC143C) → Deep Purple (#4A0E4E)
   */
  intensityToColor(intensity, opacity = null) {
    if (intensity <= 0) return 'transparent';

    const clamped = Math.max(0, Math.min(10, intensity));

    let hue;
    if (clamped <= 3) {
      // Yellow (50) to Orange (30)
      hue = 50 - (clamped / 3) * 20;
    } else if (clamped <= 7) {
      // Orange (30) to Red (0)
      hue = 30 - ((clamped - 3) / 4) * 30;
    } else {
      // Red (0) to Purple (280)
      hue = ((clamped - 7) / 3) * 280;
    }

    const saturation = 85 + (clamped / 10) * 10;
    const lightness = 55 - (clamped / 10) * 15;
    const effectiveOpacity = opacity !== null
      ? opacity
      : 0.3 + (clamped / 10) * 0.65;

    return `hsla(${hue.toFixed(1)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%, ${effectiveOpacity.toFixed(3)})`;
  }

  /**
   * Convert HSL string to THREE.Color for shaders
   */
  hslToColor(hslString) {
    const match = hslString.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%,?\s*([\d.]+)?\)/);
    if (!match) return new THREE.Color(1, 1, 1);

    const h = parseInt(match[1]) / 360;
    const s = parseInt(match[2]) / 100;
    const l = parseInt(match[3]) / 100;
    const a = match[4] !== undefined ? parseFloat(match[4]) : 1;

    return { color: new THREE.Color().setHSL(h, s, l), alpha: a };
  }

  /**
   * Initialize the 3D scene, camera, renderer, and body model
   */
  async init() {
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
   * Setup WebGL renderer with mobile performance optimizations
   */
  setupRenderer() {
    // Mobile-optimized settings
    const pixelRatioCap = this.isMobile ? 1.5 : 2;

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isMobile, // Disable AA on mobile for performance
        alpha: true,
        powerPreference: 'high-performance'
      });

      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      // Shadow optimization - disable on mobile
      if (this.isMobile) {
        this.renderer.shadowMap.enabled = false;
      } else {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      // Clear and append renderer
      this.container.innerHTML = '';
      this.container.appendChild(this.renderer.domElement);
      this.container.style.position = 'relative';

      // WebGL context loss handling
      this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.webglLost = true;
        this.isPaused = true;
        console.warn('WebGL context lost - attempting to recover');
      }, false);

      this.renderer.domElement.addEventListener('webglcontextrestored', () => {
        this.webglLost = false;
        this.isPaused = false;
        this.needsRender = true;
        console.info('WebGL context restored');
      }, false);

    } catch (error) {
      console.error('Failed to initialize WebGL renderer:', error);
      throw new Error('WebGL initialization failed. Your browser may not support WebGL.');
    }
  }

  /**
   * Setup scene lighting with mobile optimizations
   */
  setupLighting() {
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    // Main directional light (key light) - shadows disabled on mobile
    const mainLight = new THREE.DirectionalLight(0xffffff, this.isMobile ? 0.6 : 0.8);
    mainLight.position.set(5, 5, 5);
    mainLight.castShadow = !this.isMobile;
    this.scene.add(mainLight);

    // Fill light from opposite side - skip on mobile
    if (!this.isMobile) {
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
      fillLight.position.set(-5, 3, 5);
      this.scene.add(fillLight);
    }

    // Rim light for edge definition
    const rimLight = new THREE.DirectionalLight(0xffffff, this.isMobile ? 0.2 : 0.4);
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
    this.controls.maxPolarAngle = Math.PI / 1.5; // Don't go below ground
    this.controls.enablePan = false;
  }

  /**
   * Create procedural low-poly human body model
   */
  async createBodyModel() {
    // Create body parts using geometric primitives
    const bodyParts = this.createBodyGeometry();

    // Add all parts to the body model group
    bodyParts.forEach(part => {
      this.bodyModel.add(part.mesh);
      this.bodyMeshes.push(part.mesh);
    });

    // Position and scale the complete model
    this.bodyModel.position.set(0, 0, 0);
    this.bodyModel.scale.set(1, 1, 1);

    this.scene.add(this.bodyModel);
  }

  /**
   * Generate procedural body geometry using primitives with gender variants
   * @param {string} gender - 'male' or 'female' body shape
   */
  createBodyGeometry(gender = 'male') {
    const parts = [];
    const isDark = this.isDarkMode;
    const baseColor = isDark ? 0x2a3a3a : 0xe8f0ec;
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.7,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9
    });

    // Gender-specific body proportions
    const isFemale = gender === 'female';
    const shoulderWidth = isFemale ? 0.65 : 0.75; // Narrower shoulders for female
    const hipWidth = isFemale ? 0.55 : 0.45; // Wider hips for female
    const waistScale = isFemale ? 0.85 : 1.0; // More defined waist for female
    const chestDepth = isFemale ? 0.38 : 0.35; // Slightly deeper chest for female

    // HEAD - Sphere/ellipsoid
    const headGeometry = new THREE.SphereGeometry(0.35, 32, 32);
    const headMaterial = this.createHeatmapMaterial(baseColor);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 1.7, 0);
    head.userData = { regionId: 'head-face', regionName: 'Head / Face', side: 'front' };
    parts.push({ name: 'head', mesh: head });
    this.regionMaterials.set('head-face', headMaterial);

    // EYES - Small spheres (front only)
    const eyeGeometry = new THREE.SphereGeometry(0.06, 16, 16);
    const eyeMaterial = this.createHeatmapMaterial(baseColor);
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.12, 1.75, 0.28);
    leftEye.scale.set(1, 0.6, 0.4);
    leftEye.userData = { regionId: 'eyes', regionName: 'Eyes', side: 'front' };

    const rightEye = leftEye.clone();
    rightEye.position.set(0.12, 1.75, 0.28);
    rightEye.userData = { regionId: 'eyes', regionName: 'Eyes', side: 'front' };

    parts.push({ name: 'eyes-left', mesh: leftEye });
    parts.push({ name: 'eyes-right', mesh: rightEye });
    this.regionMaterials.set('eyes', eyeMaterial);

    // THROAT - Small cylinder
    const throatGeometry = new THREE.CylinderGeometry(0.12, 0.14, 0.15, 16);
    const throatMaterial = this.createHeatmapMaterial(baseColor);
    const throat = new THREE.Mesh(throatGeometry, throatMaterial);
    throat.position.set(0, 1.45, 0);
    throat.userData = { regionId: 'throat-mouth', regionName: 'Throat / Mouth', side: 'front' };
    parts.push({ name: 'throat', mesh: throat });
    this.regionMaterials.set('throat-mouth', throatMaterial);

    // TORSO - Stretched box with gender-specific proportions
    const chestGeometry = new THREE.BoxGeometry(shoulderWidth, 0.5, chestDepth);
    const chestMaterial = this.createHeatmapMaterial(baseColor);
    const chest = new THREE.Mesh(chestGeometry, chestMaterial);
    chest.position.set(0, 1.15, 0);
    chest.userData = { regionId: 'chest-lungs', regionName: 'Chest / Lungs', side: 'front' };
    parts.push({ name: 'chest', mesh: chest });
    this.regionMaterials.set('chest-lungs', chestMaterial);

    // ABDOMEN - Gender-specific waist/hip proportions
    const abdomenGeometry = new THREE.BoxGeometry(hipWidth * waistScale, 0.45, 0.28);
    const abdomenMaterial = this.createHeatmapMaterial(baseColor);
    const abdomen = new THREE.Mesh(abdomenGeometry, abdomenMaterial);
    abdomen.position.set(0, 0.7, 0);
    abdomen.userData = { regionId: 'stomach-gut', regionName: 'Stomach / Gut', side: 'front' };
    parts.push({ name: 'abdomen', mesh: abdomen });
    this.regionMaterials.set('stomach-gut', abdomenMaterial);

    // NECK (back) - cylinder
    const neckBackGeometry = new THREE.CylinderGeometry(0.12, 0.14, 0.2, 16);
    const neckBackMaterial = this.createHeatmapMaterial(baseColor);
    const neckBack = new THREE.Mesh(neckBackGeometry, neckBackMaterial);
    neckBack.position.set(0, 1.55, -0.1);
    neckBack.userData = { regionId: 'back-neck', regionName: 'Neck / Shoulders', side: 'back' };
    parts.push({ name: 'neck-back', mesh: neckBack });
    this.regionMaterials.set('back-neck', neckBackMaterial);

    // UPPER BACK - gender-specific width
    const upperBackGeometry = new THREE.BoxGeometry(shoulderWidth + 0.05, 0.4, 0.28);
    const upperBackMaterial = this.createHeatmapMaterial(baseColor);
    const upperBack = new THREE.Mesh(upperBackGeometry, upperBackMaterial);
    upperBack.position.set(0, 1.15, -0.12);
    upperBack.userData = { regionId: 'back-upper', regionName: 'Upper Back', side: 'back' };
    parts.push({ name: 'upper-back', mesh: upperBack });
    this.regionMaterials.set('back-upper', upperBackMaterial);

    // LOWER BACK
    const lowerBackGeometry = new THREE.BoxGeometry(0.6, 0.35, 0.25);
    const lowerBackMaterial = this.createHeatmapMaterial(baseColor);
    const lowerBack = new THREE.Mesh(lowerBackGeometry, lowerBackMaterial);
    lowerBack.position.set(0, 0.7, -0.1);
    lowerBack.userData = { regionId: 'back-lower', regionName: 'Lower Back', side: 'back' };
    parts.push({ name: 'lower-back', mesh: lowerBack });
    this.regionMaterials.set('back-lower', lowerBackMaterial);

    // BACK OF HEAD (occiput) - hemisphere on back of head
    const headBackGeometry = new THREE.SphereGeometry(0.32, 32, 16, 0, Math.PI * 2, Math.PI / 3, Math.PI / 2);
    const headBackMaterial = this.createHeatmapMaterial(baseColor);
    const headBack = new THREE.Mesh(headBackGeometry, headBackMaterial);
    headBack.position.set(0, 1.7, -0.15);
    headBack.rotation.y = Math.PI;
    headBack.userData = { regionId: 'back-head', regionName: 'Back of Head', side: 'back' };
    parts.push({ name: 'head-back', mesh: headBack });
    this.regionMaterials.set('back-head', headBackMaterial);

    // BUTTOCKS/GLUTES - two spheres
    const gluteGeometry = new THREE.SphereGeometry(0.18, 16, 16);
    const gluteMaterial = this.createHeatmapMaterial(baseColor);

    const leftGlute = new THREE.Mesh(gluteGeometry, gluteMaterial);
    leftGlute.position.set(-0.2, 0.15, -0.15);
    leftGlute.scale.set(1.2, 1.0, 0.8);
    leftGlute.userData = { regionId: 'buttocks', regionName: 'Buttocks / Hips', side: 'back' };

    const rightGlute = leftGlute.clone();
    rightGlute.position.set(0.2, 0.15, -0.15);
    rightGlute.userData = { regionId: 'buttocks', regionName: 'Buttocks / Hips', side: 'back' };

    parts.push({ name: 'glute-left', mesh: leftGlute });
    parts.push({ name: 'glute-right', mesh: rightGlute });
    this.regionMaterials.set('buttocks', gluteMaterial);

    // ARMS - Cylinders for upper and lower arms (FRONT) - gender-specific thickness
    const createArm = (side) => {
      const direction = side === 'left' ? -1 : 1;
      const armThickness = isFemale ? 0.085 : 0.1; // Slightly thinner arms for female

      // Upper arm
      const upperArmGeometry = new THREE.CylinderGeometry(armThickness, armThickness * 0.9, 0.5, 16);
      const upperArmMaterial = this.createHeatmapMaterial(baseColor);
      const upperArm = new THREE.Mesh(upperArmGeometry, upperArmMaterial);
      upperArm.position.set(direction * (shoulderWidth / 2 + 0.1), 1.2, 0);
      upperArm.rotation.z = direction * 0.15;
      upperArm.userData = { regionId: 'arms-hands', regionName: 'Arms / Hands', side: 'front' };

      // Lower arm
      const lowerArmGeometry = new THREE.CylinderGeometry(armThickness * 0.8, armThickness * 0.7, 0.45, 16);
      const lowerArmMaterial = this.createHeatmapMaterial(baseColor);
      const lowerArm = new THREE.Mesh(lowerArmGeometry, lowerArmMaterial);
      lowerArm.position.set(direction * (shoulderWidth / 2 + 0.17), 0.72, 0);
      lowerArm.rotation.z = direction * 0.1;
      lowerArm.userData = { regionId: 'arms-hands', regionName: 'Arms / Hands', side: 'front' };

      // Hand
      const handGeometry = new THREE.SphereGeometry(0.07, 16, 16);
      const handMaterial = this.createHeatmapMaterial(baseColor);
      const hand = new THREE.Mesh(handGeometry, handMaterial);
      hand.position.set(direction * (shoulderWidth / 2 + 0.23), 0.48, 0);
      hand.scale.set(1, 1.3, 0.6);
      hand.userData = { regionId: 'arms-hands', regionName: 'Arms / Hands', side: 'front' };

      return [
        { name: `arm-${side}-upper`, mesh: upperArm },
        { name: `arm-${side}-lower`, mesh: lowerArm },
        { name: `hand-${side}`, mesh: hand }
      ];
    };

    parts.push(...createArm('left'));
    parts.push(...createArm('right'));
    this.regionMaterials.set('arms-hands', upperArmMaterial);

    // LEGS - Cylinders for thighs and calves (FRONT) + back portions - gender-specific proportions
    const createLeg = (side) => {
      const direction = side === 'left' ? -1 : 1;
      const thighWidth = isFemale ? 0.14 : 0.13; // Slightly wider thighs for female
      const hipOffset = isFemale ? 0.28 : 0.22; // Wider hip stance for female

      // Upper leg (thigh) - front
      const upperLegGeometry = new THREE.CylinderGeometry(thighWidth, thighWidth * 0.85, 0.6, 16);
      const upperLegMaterial = this.createHeatmapMaterial(baseColor);
      const upperLeg = new THREE.Mesh(upperLegGeometry, upperLegMaterial);
      upperLeg.position.set(direction * hipOffset, 0.35, 0);
      upperLeg.userData = { regionId: 'legs-feet', regionName: 'Legs / Feet', side: 'front' };

      // Lower leg (calf) - front
      const lowerLegGeometry = new THREE.CylinderGeometry(thighWidth * 0.75, thighWidth * 0.6, 0.55, 16);
      const lowerLegMaterial = this.createHeatmapMaterial(baseColor);
      const lowerLeg = new THREE.Mesh(lowerLegGeometry, lowerLegMaterial);
      lowerLeg.position.set(direction * hipOffset, -0.23, 0);
      lowerLeg.userData = { regionId: 'legs-feet', regionName: 'Legs / Feet', side: 'front' };

      // Foot - front
      const footGeometry = new THREE.BoxGeometry(0.12, 0.08, 0.2);
      const footMaterial = this.createHeatmapMaterial(baseColor);
      const foot = new THREE.Mesh(footGeometry, footMaterial);
      foot.position.set(direction * hipOffset, -0.52, 0.08);
      foot.userData = { regionId: 'legs-feet', regionName: 'Legs / Feet', side: 'front' };

      // Back of thigh (hamstring) - slightly offset to back
      const hamstringGeometry = new THREE.CylinderGeometry(thighWidth * 0.9, thighWidth * 0.8, 0.5, 16);
      const hamstringMaterial = this.createHeatmapMaterial(baseColor);
      const hamstring = new THREE.Mesh(hamstringGeometry, hamstringMaterial);
      hamstring.position.set(direction * hipOffset, 0.35, -0.08);
      hamstring.userData = { regionId: 'legs-back', regionName: 'Legs Back (Hamstrings)', side: 'back' };

      // Back of calf - slightly offset to back
      const calfBackGeometry = new THREE.CylinderGeometry(thighWidth * 0.7, thighWidth * 0.6, 0.4, 16);
      const calfBackMaterial = this.createHeatmapMaterial(baseColor);
      const calfBack = new THREE.Mesh(calfBackGeometry, calfBackMaterial);
      calfBack.position.set(direction * hipOffset, -0.23, -0.06);
      calfBack.userData = { regionId: 'legs-back', regionName: 'Calves (Back)', side: 'back' };

      // Heel/Achilles - back of foot
      const heelGeometry = new THREE.BoxGeometry(0.1, 0.06, 0.15);
      const heelMaterial = this.createHeatmapMaterial(baseColor);
      const heel = new THREE.Mesh(heelGeometry, heelMaterial);
      heel.position.set(direction * hipOffset, -0.52, -0.05);
      heel.userData = { regionId: 'legs-back', regionName: 'Heels / Achilles', side: 'back' };

      return [
        { name: `leg-${side}-upper`, mesh: upperLeg },
        { name: `leg-${side}-lower`, mesh: lowerLeg },
        { name: `foot-${side}`, mesh: foot },
        { name: `hamstring-${side}`, mesh: hamstring },
        { name: `calf-back-${side}`, mesh: calfBack },
        { name: `heel-${side}`, mesh: heel }
      ];
    };

    parts.push(...createLeg('left'));
    parts.push(...createLeg('right'));
    this.regionMaterials.set('legs-feet', upperLegMaterial);
    this.regionMaterials.set('legs-back', upperLegMaterial);

    return parts;
  }

  /**
   * Create shader material for heatmap visualization with professional medical gradient
   * Features:
   * - Medical color scale: Blue (none) → Green (mild) → Yellow (moderate) → Red (severe)
   * - Radial spread with exponential falloff for smooth gradients
   * - Smoother pulse animation with easing
   * - Fresnel rim lighting for depth
   */
  createHeatmapMaterial(baseColor) {
    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      uniform float uTime;
      uniform float uPulseIntensity;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      uniform vec3 uBaseColor;
      uniform vec3 uPainColor;
      uniform float uPainIntensity;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uPulseIntensity;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;

      // Medical color gradient: Blue → Green → Yellow → Red
      vec3 getMedicalGradient(float t) {
        t = clamp(t, 0.0, 1.0);

        vec3 blue = vec3(0.0, 0.0, 1.0);      // Blue (none)
        vec3 green = vec3(0.0, 1.0, 0.0);     // Green (mild)
        vec3 yellow = vec3(1.0, 1.0, 0.0);    // Yellow (moderate)
        vec3 red = vec3(1.0, 0.0, 0.0);       // Red (severe)

        if (t < 0.33) {
          return mix(blue, green, t / 0.33);
        } else if (t < 0.66) {
          return mix(green, yellow, (t - 0.33) / 0.33);
        } else {
          return mix(yellow, red, (t - 0.66) / 0.34);
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
        vec3 gradientColor = getMedicalGradient(uPainIntensity);

        // Mix base with gradient color
        vec3 finalColor = mix(uBaseColor, gradientColor, uPainIntensity * 0.85);

        // Add fresnel rim for depth
        finalColor = mix(finalColor, vec3(1.0), fresnel * 0.2);

        // Smoother pulse animation with easing (only for high intensity > 0.7)
        float pulse = 1.0;
        if (uPulseIntensity > 0.0) {
          // Smoothstep easing for gentler pulse
          float pulseWave = smoothstep(0.0, 1.0, sin(uTime * 2.0) * 0.5 + 0.5);
          pulse = 1.0 + pulseWave * 0.2 * uPulseIntensity;
        }

        // Apply opacity with pulse
        float finalOpacity = uOpacity * pulse;

        gl_FragColor = vec4(finalColor * normalShading, finalOpacity);
      }
    `;

    const isDark = this.isDarkMode;
    const baseColorVec = new THREE.Color(baseColor);

    const uniforms = {
      uBaseColor: { value: baseColorVec },
      uPainColor: { value: new THREE.Color(1, 0.5, 0) }, // Default orange
      uPainIntensity: { value: 0 },
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

    // Mouse down/up for hold-to-increase on desktop
    canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    canvas.addEventListener('mouseup', this.onMouseUp.bind(this));

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

    // Visibility change - pause rendering when tab is hidden (performance)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.isPaused = true;
      } else {
        this.isPaused = false;
        this.needsRender = true;
      }
    });
  }

  /**
   * Handle mouse click for pain selection
   */
  onMouseClick(event) {
    if (this.controls.enabled && event.buttons === 2) return; // Right-click for rotation

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.bodyMeshes, true);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const regionId = mesh.userData.regionId;

      if (regionId && event.shiftKey) {
        // Shift+click decreases intensity
        this.handleRegionClick(regionId, -1);
      } else if (regionId) {
        // Regular click increases intensity
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

      // Show tooltip on hover
      const regionId = mesh.userData.regionId;
      if (regionId) {
        this.showTooltip(regionId, event.clientX, event.clientY);
      }
    } else {
      document.body.style.cursor = 'default';
      this.hideTooltip();
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
  }

  /**
   * Handle mouse down - start hold-to-increase for desktop
   */
  onMouseDown(event) {
    if (this.controls.enabled && event.buttons === 2) return; // Right-click for rotation

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
        // Start hold timer for acceleration (same as touch)
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
      // Regular click (not hold) - apply single increment
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
        // Start hold timer for acceleration
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
      this.selectedRegions.set(regionId, {
        intensity: newIntensity,
        points: currentData?.points || []
      });
    }

    this.applyIntensityVisual(regionId, newIntensity);
    this.updateSummaryDisplay();
    this.triggerRender();
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

    const colorData = this.hslToColor(this.intensityToColor(intensity));
    const opacity = colorData.alpha;

    // Update all meshes for this region
    regionData.meshes.forEach(meshName => {
      const mesh = this.bodyModel.getObjectByName(meshName);
      if (mesh && mesh.material.uniforms) {
        const uniforms = mesh.material.uniforms;
        uniforms.uPainColor.value = colorData.color;
        uniforms.uPainIntensity.value = intensity / 10;
        uniforms.uOpacity.value = opacity;
        uniforms.uPulseIntensity.value = intensity > 7 ? (intensity - 7) / 3 : 0;
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
      this.tooltip.className = 'intensity-tooltip-3d';
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
    uiContainer.className = 'body-heatmap-3d-ui';
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

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.style.cssText = `
      padding: 8px 14px;
      border: none;
      border-radius: 6px;
      background: var(--green, #1a6b4a);
      color: white;
      font-family: 'DM Sans', sans-serif;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    exportBtn.onmouseover = () => exportBtn.style.transform = 'translateY(-1px)';
    exportBtn.onmouseout = () => exportBtn.style.transform = 'translateY(0)';
    exportBtn.onclick = () => this.exportData().then(data => {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    });

    actionRow.appendChild(resetBtn);
    actionRow.appendChild(exportBtn);

    // Selected regions summary
    const summaryContainer = document.createElement('div');
    summaryContainer.id = 'selected-regions-3d-summary';
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
    summaryChips.id = 'summary-chips-3d';
    summaryChips.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    `;

    summaryContainer.appendChild(summaryTitle);
    summaryContainer.appendChild(summaryChips);

    uiContainer.appendChild(viewToggle);
    uiContainer.appendChild(actionRow);
    uiContainer.appendChild(summaryContainer);

    this.container.appendChild(uiContainer);

    // Add legend
    const legendContainer = document.createElement('div');
    legendContainer.className = 'heatmap-legend-3d';
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
      min-width: 250px;
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
    legendTitle.textContent = 'Pain Intensity (0-10)';

    const legendBar = document.createElement('div');
    legendBar.style.cssText = `
      width: 100%;
      height: 16px;
      border-radius: 8px;
      background: linear-gradient(to right,
        transparent 0%,
        rgba(255, 225, 53, 0.7) 10%,
        rgba(255, 149, 0, 0.8) 30%,
        rgba(220, 20, 60, 0.9) 70%,
        rgba(74, 14, 78, 0.95) 100%
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
    const chipsContainer = document.getElementById('summary-chips-3d');
    const summaryContainer = document.getElementById('selected-regions-3d-summary');

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

        const intensity = typeof data === 'object' ? data.intensity : data;
        const color = this.intensityToColor(intensity);
        const filledSegments = Math.round(intensity);

        return `
          <div class="summary-chip-3d" data-region="${regionId}" style="
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
                  background: ${i < Math.ceil(intensity / 2) ? color : 'rgba(100,100,100,0.2)'};
                "></span>
              `).join('')}
            </div>
            <span style="font-size: 0.65rem; font-weight: 700; min-width: 24px; text-align: right; color: ${isDark ? '#a8b5a0' : '#6b6b60'}">${intensity.toFixed(1)}</span>
            <button class="chip-remove-3d" data-region="${regionId}" style="
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
    chipsContainer.querySelectorAll('.chip-remove-3d').forEach(btn => {
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
    const time = Date.now() * 0.001;

    if (view === 'front') {
      this.camera.position.set(0, 0.5, 5);
      this.controls.enabled = true;
    } else if (view === 'back') {
      this.camera.position.set(0, 0.5, -5);
      this.controls.enabled = true;
    } else if (view === '360') {
      // Enable auto-rotation
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 2.0;
    }
  }

  /**
   * Reset camera to default position
   */
  resetCamera() {
    this.camera.position.set(0, 0.5, 5);
    this.camera.lookAt(0, 0.5, 0);
    this.controls.reset();
    this.controls.autoRotate = false;
  }

  /**
   * Animation loop - optimized for mobile performance
   * Only renders when needed (user interaction or pulse animation)
   */
  animate() {
    requestAnimationFrame(this.animate);

    // Skip rendering when tab is hidden or no changes needed (mobile optimization)
    if (this.isPaused) return;

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // Always update controls for smooth camera
    this.controls.update();

    // Update shader uniforms for pulse animation
    this.bodyMeshes.forEach(mesh => {
      if (mesh.material.uniforms) {
        mesh.material.uniforms.uTime.value = elapsed;
      }
    });

    // Render only when needed or on mobile with optimizations
    if (this.needsRender || !this.isMobile || this.controls.autoRotate) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = this.controls.autoRotate; // Keep rendering if auto-rotating
    }
  }

  /**
   * Trigger a render (for on-demand rendering)
   */
  triggerRender() {
    this.needsRender = true;
    setTimeout(() => { this.needsRender = false; }, 100);
  }

  /**
   * Load initial selection
   */
  loadInitialSelection() {
    if (this.options.initialSelection && this.options.initialSelection.length > 0) {
      this.options.initialSelection.forEach(selection => {
        if (selection.area && selection.intensity) {
          this.selectedRegions.set(selection.area, {
            intensity: selection.intensity,
            points: selection.points || []
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
    const oldSummary = document.getElementById('selected-regions-3d-summary');
    if (oldSummary) {
      oldSummary.remove();
      this.createUI();
      this.updateSummaryDisplay();
    }
  }

  /**
   * Set gender and rebuild body model
   * @param {string} gender - 'male' or 'female'
   */
  setGender(gender) {
    if (gender === this.gender) return;
    this.gender = gender;

    // Save current selections
    const currentSelections = this.getSelectedData();

    // Remove old body model
    this.bodyModel.clear();
    this.bodyMeshes = [];
    this.regionMaterials.clear();

    // Create new body model with gender
    this.createBodyModel().then(() => {
      // Restore selections
      this.setRegions(currentSelections);
    });
  }

  /**
   * Get selected data in standard format
   */
  getSelectedData() {
    return Array.from(this.selectedRegions.entries()).map(([area, data]) => {
      const intensity = typeof data === 'object' ? data.intensity : data;
      return {
        area,
        intensity,
        name: this.regions[area]?.name || area
      };
    });
  }

  /**
   * Get intensity for a specific region
   */
  getIntensity(regionId) {
    const data = this.selectedRegions.get(regionId);
    if (!data) return 0;
    return typeof data === 'object' ? data.intensity : data;
  }

  /**
   * Set intensity for a specific region
   */
  setIntensity(regionId, intensity) {
    const clamped = Math.max(0, Math.min(this.maxIntensity, intensity));
    this.selectedRegions.set(regionId, { intensity: clamped, points: [] });
    this.applyIntensityVisual(regionId, clamped);
    this.updateSummaryDisplay();
    this.options.onSelectionChange(this.getSelectedData());
  }

  /**
   * Set multiple regions at once (for state sync when switching modes)
   * Alias: setSelections (for HeatmapSwitcher compatibility)
   * @param {Array} regions - Array of { area, intensity, name }
   */
  setRegions(regions) {
    // Clear current selections
    this.selectedRegions.clear();

    // Reset all mesh visuals to base state
    this.bodyMeshes.forEach(mesh => {
      if (mesh.material.uniforms) {
        mesh.material.uniforms.uPainColor.value = new THREE.Color(1, 0.5, 0);
        mesh.material.uniforms.uPainIntensity.value = 0;
        mesh.material.uniforms.uOpacity.value = 0.85;
        mesh.material.uniforms.uPulseIntensity.value = 0;
      }
    });

    // Apply new regions
    if (regions && regions.length > 0) {
      regions.forEach(region => {
        if (region.area && region.intensity > 0) {
          this.selectedRegions.set(region.area, {
            intensity: Math.max(0, Math.min(this.maxIntensity, region.intensity)),
            points: region.points || []
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
   * @param {Array} regions - Array of { area, intensity, name }
   */
  setSelections(regions) {
    return this.setRegions(regions);
  }

  /**
   * Get all regions with intensities
   */
  getAllIntensities() {
    const result = {};
    Object.keys(this.regions).forEach(regionId => {
      result[regionId] = this.getIntensity(regionId);
    });
    return result;
  }

  /**
   * Clear all selections
   */
  clear() {
    this.selectedRegions.clear();

    this.bodyMeshes.forEach(mesh => {
      if (mesh.material.uniforms) {
        mesh.material.uniforms.uPainColor.value = new THREE.Color(1, 0.5, 0);
        mesh.material.uniforms.uPainIntensity.value = 0;
        mesh.material.uniforms.uOpacity.value = 0.85;
        mesh.material.uniforms.uPulseIntensity.value = 0;
      }
    });

    this.updateSummaryDisplay();
    this.options.onSelectionChange([]);
  }

  /**
   * Get enhanced format (matches 2D version)
   */
  getEnhancedFormat() {
    const selections = this.getSelectedData();
    if (selections.length === 0) return null;

    return {
      regions: selections,
      primaryArea: selections.reduce((max, s) => s.intensity > max.intensity ? s : max, selections[0]).area,
      totalRegions: selections.length,
      maxIntensity: Math.max(...selections.map(s => s.intensity)),
      averageIntensity: selections.reduce((sum, s) => sum + s.intensity, 0) / selections.length,
      legacyBodyArea: this.getLegacyFormat()
    };
  }

  /**
   * Get legacy format for API compatibility
   */
  getLegacyFormat() {
    const selections = this.getSelectedData();
    if (selections.length === 0) return '';

    const primary = selections.reduce((max, s) => s.intensity > max.intensity ? s : max, selections[0]);

    const areaMap = {
      'head-face': 'head / nervous',
      'eyes': 'eyes',
      'throat-mouth': 'throat / mouth',
      'chest-lungs': 'chest / lungs',
      'stomach-gut': 'stomach / gut',
      'arms-hands': 'arms / hands',
      'legs-feet': 'legs / feet',
      'back-upper': 'back',
      'back-lower': 'back',
      'back-neck': 'head / nervous'
    };

    return areaMap[primary.area] || 'other / unsure';
  }

  /**
   * Export data with timestamp
   */
  async exportData() {
    return {
      timestamp: new Date().toISOString(),
      view: this.currentView,
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

    // Remove event listeners
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('click', this.onMouseClick);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseleave', this.onMouseLeave);

    // Dispose Three.js resources
    this.bodyMeshes.forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();

    // Clear references
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.bodyModel = null;
    this.bodyMeshes = [];
  }
}

// Export for ES modules
export { BodyHeatmap3D };

// Auto-initialize if data attribute present
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const containers = document.querySelectorAll('[data-body-heatmap-3d]');
    containers.forEach(async (container) => {
      const heatmap = new BodyHeatmap3D(container.id, {
        onSelectionChange: (data) => {
          window.mediscanBodySelections3D = data;
        }
      });
      await heatmap.init();
      window.mediscanBodyHeatmap3D = heatmap;
    });
  });
}
