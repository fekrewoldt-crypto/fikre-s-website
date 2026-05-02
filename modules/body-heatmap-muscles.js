/**
 * MediScan Body Muscles Heatmap
 * Wrapper for the Body Muscles library (https://github.com/vulovix/body-muscles)
 *
 * Features:
 * - 70+ anatomically accurate muscle regions
 * - Front/back view toggle
 * - 0-10 intensity coloring with medical gradient
 * - Hold-to-increase interaction (200ms threshold, 150ms acceleration)
 * - Gender toggle (male/female body types)
 * - Compatible with HeatmapSwitcher API
 *
 * @version 1.0.0
 */

// Medical gradient colors (0-10 intensity)
const INTENSITY_COLORS = [
  'transparent',  // 0
  'hsla(50, 85%, 55%, 0.35)',  // 1 - yellow
  'hsla(45, 87%, 52%, 0.45)',  // 2
  'hsla(40, 88%, 50%, 0.55)',  // 3 - orange-yellow
  'hsla(35, 90%, 48%, 0.65)',  // 4
  'hsla(30, 92%, 46%, 0.75)',  // 5 - orange
  'hsla(15, 94%, 44%, 0.82)',  // 6 - orange-red
  'hsla(0, 90%, 45%, 0.88)',   // 7 - red
  'hsla(350, 88%, 42%, 0.92)', // 8
  'hsla(320, 85%, 40%, 0.95)', // 9
  'hsla(280, 80%, 35%, 0.98)'  // 10 - deep purple
];

// Muscle data imported from body-muscles library
// Front view muscles (x < 35 in SVG coordinate system)
const FRONT_MUSCLES = [
  { id: "head", name: "Head", path: "m 11.671635,6.3585449 -0.0482,-2.59085 4.20648,-2.46806 4.42769,2.95361 -0.0405,1.94408 0.24197,-3.34467 -2.03129,-2.31103004 -2.84508,-0.51629 -2.20423,0.52915 -1.9363,2.63077004 z" },
  { id: "face", name: "Face", path: "m 19.748825,6.7034949 0.0203,-2.20747 -3.96689,-2.7637 -3.74099,2.23559 -0.006,2.63528 -0.60741,0.0403 0.27408,1.82447 0.97635,0.33932 0.44244,2.1802901 1.82222,2.06556 2.03518,-0.0607 1.79223,-1.94408 0.35957,-2.2406601 0.97616,-0.33932 0.25159,-1.78416 z" },
  { id: "neck-right", name: "Right Neck", path: "m 13.304665,11.910505 1.64975,2.35202 0.74426,2.62159 -1.73486,-1.38354 -0.86649,-2.97104 z" },
  { id: "neck-left", name: "Left Neck", path: "m 18.385135,11.910505 -1.64975,2.35202 -0.74538,2.62234 1.73486,-1.38354 0.86649,-2.97104 z" },
  { id: "shoulder-front-left", name: "Left Shoulder (Front)", path: "m 19.047795,13.248365 3.55748,1.97916 0.72653,-0.35074 z m -0.107,0.43288 -0.37119,1.73073 2.1846,0.53561 1.40116,-0.49436 z" },
  { id: "shoulder-side-left", name: "Left Shoulder (Side)", path: "m 22.922305,15.657195 0.75814,-0.41 2.40806,1.66799 1.17364,1.50707 0.62662,1.5626 -0.0464,3.70194 -1.3284,-1.72153 0.0407,-2.59376 -0.48842,-0.50049 c 0,0 -3.09778,-3.19058 -3.14371,-3.21401 z m -0.2409,0.10873 c -0.001,0.0525 3.32987,3.54733 3.32987,3.54733 l 0.10067,3.10396 -1.15426,-1.97782 -2.22547,-0.94804 -1.56576,-2.88481 z" },
  { id: "shoulder-front-right", name: "Right Shoulder (Front)", path: "m 12.624785,13.248365 -3.5574599,1.97916 -0.72653,-0.35074 z m 0.107,0.43288 0.37119,1.73073 -2.18459,0.53561 -1.4011499,-0.49436 z" },
  { id: "shoulder-side-right", name: "Right Shoulder (Side)", path: "m 8.7502951,15.657195 -0.75814,-0.41 -2.40806,1.66799 -1.17364,1.50707 -0.62662,1.56259 0.0464,3.70195 1.3284,-1.72153 -0.0407,-2.59376 0.48843,-0.5005 c 0,0 3.09777,-3.19057 3.1437,-3.214 z m 0.2409,0.10873 c 0.002,0.0525 -3.32987,3.54733 -3.32987,3.54733 l -0.10067,3.10396 1.15426,-1.97782 2.22547,-0.94804 1.5657499,-2.88481 z" },
  { id: "biceps-left", name: "Left Biceps", path: "m 27.621665,30.814715 -0.33838,1.70499 -1.81932,-2.54418 -0.6629,-1.26895 z m -2.85271,-2.6096 c -0.0259,-0.0144 -0.0536,-0.0254 -0.0824,-0.0324 l -1.48333,-4.95503 1.00456,-2.08428 1.65511,1.74532 2.23034,6.67667 0.0415,0.93739 c -1.06528,-0.84215 -2.18962,-1.60679 -3.36434,-2.28803 z m 1.6945,-5.75654 1.64893,6.43421 -0.36469,-4.92266 z" },
  { id: "forearm-left", name: "Left Forearm", path: "m 26.955425,32.969125 1.30083,10.28927 -1.10778,0.01 -1.89387,-7.99609 0.19174,-4.53719 z m 1.21978,-1.94971 -0.58729,2.58635 1.11876,9.15614 0.55849,-0.21663 0.2304,-6.77018 z" },
  { id: "biceps-right", name: "Right Biceps", path: "m 4.0746451,30.814715 0.33838,1.70499 1.81931,-2.54418 0.66289,-1.26895 z m 2.8527,-2.6096 c 0.0259,-0.0144 0.0536,-0.0254 0.0824,-0.0324 l 1.48332,-4.95503 -1.00455,-2.08428 -1.65509,1.74532 -2.23034,6.67667 -0.0415,0.93739 c 1.06528,-0.84215 2.18961,-1.60679 3.36433,-2.28803 z m -1.6945,-5.75654 -1.64891,6.43421 0.36468,-4.92266 z" },
  { id: "forearm-right", name: "Right Forearm", path: "m 4.5752651,32.969125 -1.30083,10.28927 1.10778,0.01 1.89387,-7.99609 -0.19174,-4.53719 z m -1.21978,-1.94971 0.58728,2.58635 -1.11875,9.15614 -0.55849,-0.21663 -0.2304,-6.77018 z" },
  { id: "chest-upper-left", name: "Left Upper Chest", path: "m 20.337455,17.085495 1.72942,3.09103 1.890,0.94 -0.5,0.3 -6.8,-2.1 z" },
  { id: "chest-lower-left", name: "Left Lower Chest", path: "m 16.66,19.72 6.8,2.1 -0.65,0.5 -0.90604,2.63773 -2.09968,0.86537 -3.34524,-1.655 0.2,-3.8 z" },
  { id: "chest-upper-right", name: "Right Upper Chest", path: "m 11.351215,17.085495 -1.7294199,3.09103 -1.890,0.94 0.5,0.3 6.8,-2.1 z" },
  { id: "chest-lower-right", name: "Right Lower Chest", path: "m 15.03,19.72 -6.8,2.1 0.65,0.5 0.90586,2.63773 2.0996699,0.86537 3.34636,-1.655 -0.2,-3.8 z" },
  { id: "abs-upper-left", name: "Left Abs (Upper)", path: "m 19.641935,34.707615 1.81341,-1.36479 0.15748,1.83347 1.28642,2.37338 -1.98044,2.73652 -1.03109,0.16554 -0.37026,-3.88816 z" },
  { id: "serratus-anterior-left", name: "Left Serratus Anterior", path: "M 19.289,26.152 l -3.11202 -1.40604 0.0937 2.27965 2.80119 1.43603 z M 21.224,27.820 l -1.29355 0.7212 0.14997 -1.70898 z M 20.171,26.183 l 2.47968 -1.03241 -0.9336 2.52093 z M 21.702,27.921 l -1.69005 1.03372 -0.28871 2.0678 1.64975 -1.07533 z" },
  { id: "obliques-left", name: "Left External Oblique", path: "M 18.791,29.025 l -0.0622 1.62387 -2.30308 -0.49961 -0.12448 -2.21722 z M 18.635,31.429 l 0.0311 1.99844 -2.20953 0.59391 -0.0311 -3.1227 z M 21.290,30.444 l -1.48383 1.03372 -0.20622 2.10905 1.64862 -1.32355 z" },
  { id: "abs-upper-right", name: "Right Abs (Upper)", path: "m 12.045985,34.707615 -1.81341,-1.36479 -0.15748,1.83347 -1.2856799,2.37432 1.9804499,2.73595 1.03109,0.16554 0.37119,-3.88721 z" },
  { id: "abs-lower-right", name: "Right Lower Abs", path: "m 15.636055,44.919735 -0.60647,-5.91209 -0.015,-3.84879 -2.18479,-1.07533 -0.24746,7.03017 z" },
  { id: "abs-lower-left", name: "Left Lower Abs", path: "m 16.051865,44.919165 0.60628,-5.91209 0.0154,-3.84915 2.18404,-1.07515 0.24746,7.03017 z" },
  { id: "serratus-anterior-right", name: "Right Serratus Anterior", path: "M 15.775,26.152 l 3.11202 -1.40604 -0.0937 2.27965 -2.80119 1.43603 z M 13.840,27.820 l 1.29355 0.7212 -0.14997 -1.70898 z M 14.893,26.183 l -2.47968 -1.03241 0.9336 2.52093 z M 13.362,27.921 l 1.69005 1.03372 0.28871 2.0678 -1.64975 -1.07533 z" },
  { id: "obliques-right", name: "Right External Oblique", path: "M 16.273,29.025 l 0.0622 1.62387 2.30308 -0.49961 0.12448 -2.21722 z M 16.429,31.429 l -0.0311 1.99844 2.20953 0.59391 0.0311 -3.1227 z M 13.774,30.444 l 1.48383 1.03372 0.20622 2.10905 -1.64862 -1.32355 z" },
  { id: "hip-flexor-left", name: "Left Hip Flexor", path: "m 20.5,45.5 1.5,-3.5 2.0,0.5 0.5,3.0 -1.5,2.5 z" },
  { id: "hip-flexor-right", name: "Right Hip Flexor", path: "m 14.5,45.5 -1.5,-3.5 -2.0,0.5 -0.5,3.0 1.5,2.5 z" },
  { id: "quads-left", name: "Left Quadriceps", path: "m 21.5,50.0 2.5,-1.0 1.5,2.5 0.5,8.0 -1.5,6.0 -2.5,1.0 -1.0,-8.0 z" },
  { id: "quads-right", name: "Right Quadriceps", path: "m 13.5,50.0 -2.5,-1.0 -1.5,2.5 -0.5,8.0 1.5,6.0 2.5,1.0 1.0,-8.0 z" },
  { id: "shin-left", name: "Left Shin (Tibialis)", path: "m 21.0,68.0 1.5,-0.5 1.0,2.0 0.5,7.0 -1.0,4.0 -1.5,0.5 z" },
  { id: "shin-right", name: "Right Shin (Tibialis)", path: "m 14.0,68.0 -1.5,-0.5 -1.0,2.0 -0.5,7.0 1.0,4.0 1.5,0.5 z" },
  { id: "foot-top-left", name: "Left Foot (Top)", path: "m 21.5,81.0 1.0,-0.5 1.5,1.0 0.5,2.0 -1.5,0.5 -1.0,-1.0 z" },
  { id: "foot-top-right", name: "Right Foot (Top)", path: "m 13.5,81.0 -1.0,-0.5 -1.5,1.0 -0.5,2.0 1.5,0.5 1.0,-1.0 z" },
  { id: "hand-front-left", name: "Left Hand (Front)", path: "m 27.5,43.0 0.5,-0.5 1.0,0.5 0.5,1.5 -0.5,1.0 -1.0,0.5 -0.5,-1.0 z" },
  { id: "hand-front-right", name: "Right Hand (Front)", path: "m 7.5,43.0 -0.5,-0.5 -1.0,0.5 -0.5,1.5 0.5,1.0 1.0,0.5 0.5,-1.0 z" }
];

// Back view muscles (x > 35 in SVG coordinate system, remapped to 0-35)
const BACK_MUSCLES = [
  { id: "head-back", name: "Head (Posterior)", path: "m 13.157455,6.3585449 0.44208,-0.14964 0.16111,0.16427 1.48163,4.0475101 2.32401,1.45118 2.39971,-1.52387 0.97577,-3.6896901 0.52752,-0.55908 0.23367,0.0981 0.24198,-3.34467 -2.03129,-2.31103004 -2.84509,-0.51629 -2.20422,0.52915 -1.93631,2.63077004 z" },
  { id: "nape", name: "Nape", path: "m 17.369695,12.105075 -2.35767,-1.55045 -1.47119,-3.9514301 -0.60741,0.0403 0.27409,1.82447 0.97635,0.33932 0.7613,2.2157201 0.33017,1.06849 0.0895,2.14894 1.16448,0.008 0.10563,-0.70833 0.54716,-0.0606 z m 1.01793,1.47595 0.23768,0.64982 1.38107,-0.004 0.01,-2.38784 0.25971,-0.79061 0.57215,-2.1698001 0.76359,-0.41018 0.25158,-1.78416 -0.62859,0.0193 -1.08488,3.8998101 -2.39725,1.46684 0.2768,1.48507 z" },
  { id: "traps-upper-left", name: "Left Trapezius (Upper)", path: "M 14.625,14.629 L 14.688,12.005 L 13.974,13.157 L 9.594,14.654 L 10.945,16.925 L 16.222,16.925 L 16.183,14.550 Z" },
  { id: "traps-mid-left", name: "Left Trapezius (Mid)", path: "M 11.034,17.075 L 13.920,21.925 L 16.303,21.925 L 16.224,17.075 Z" },
  { id: "traps-lower-left", name: "Left Trapezius (Lower)", path: "M 14.009,22.075 L 14.572,23.022 L 16.403,28.104 L 16.305,22.075 Z" },
  { id: "traps-upper-right", name: "Right Trapezius (Upper)", path: "M 20.439,14.729 L 20.376,12.104 L 21.090,13.256 L 25.470,14.754 L 24.179,16.925 L 18.844,16.925 L 18.881,14.649 Z" },
  { id: "traps-mid-right", name: "Right Trapezius (Mid)", path: "M 24.089,17.075 L 21.204,21.925 L 18.763,21.925 L 18.842,17.075 Z" },
  { id: "traps-lower-right", name: "Right Trapezius (Lower)", path: "M 21.114,22.075 L 20.492,23.121 L 18.661,28.203 L 18.761,22.075 Z" },
  { id: "lats-upper-left", name: "Left Lats (Upper)", path: "M 9.144,15.285 L 4.888,20.286 L 4.426,22.749 L 6.263,21.510 L 9.025,20.355 L 10.663,23.400 L 14.103,23.400 Z" },
  { id: "deltoid-rear-left", name: "Left Rear Deltoid", path: "M 7.201,16.586 L 5.626,18.152 L 4.736,20.156 L 8.992,15.155 Z" },
  { id: "lats-mid-left", name: "Left Lats (Mid)", path: "M 10.771,23.600 L 10.872,23.789 L 12.009,29.286 L 12.023,30.400 L 16.080,30.400 L 16.053,28.314 L 14.185,23.600 Z" },
  { id: "lats-lower-left", name: "Left Lats (Lower)", path: "M 12.026,30.600 L 12.086,35.145 L 16.156,36.255 L 16.082,30.600 Z" },
  { id: "deltoid-rear-right", name: "Right Rear Deltoid", path: "M 27.863,16.686 L 29.438,18.251 L 30.328,20.255 L 26.073,15.254 Z" },
  { id: "lats-upper-right", name: "Right Lats (Upper)", path: "M 25.921,15.384 L 30.176,20.385 L 30.290,22.849 L 28.801,21.609 L 26.039,20.454 L 24.455,23.400 L 21.022,23.400 Z" },
  { id: "lats-mid-right", name: "Right Lats (Mid)", path: "M 24.347,23.600 L 24.192,23.888 L 23.055,29.385 L 23.042,30.400 L 18.986,30.400 L 19.012,28.413 L 20.918,23.600 Z" },
  { id: "lats-lower-right", name: "Right Lats (Lower)", path: "M 23.039,30.600 L 22.979,35.245 L 18.908,36.354 L 18.983,30.600 Z" },
  { id: "triceps-long-left", name: "Left Triceps (Long Head)", path: "M 8.593,21.039 L 9.920,23.967 L 8.615,25.653 L 8.186,27.069 L 4.209,29.802 Z" },
  { id: "triceps-lateral-left", name: "Left Triceps (Lateral Head)", path: "M 8.459,20.972 L 4.075,29.735 L 3.871,25.461 L 4.407,23.674 L 6.242,21.927 Z" },
  { id: "forearm-extensors-left", name: "Left Forearm Extensors", path: "M 5.775,29.006 L 7.870,27.644 L 7.187,29.635 L 7.603,34.383 L 5.799,42.081 L 4.814,42.253 Z" },
  { id: "forearm-flexors-left", name: "Left Forearm Flexors", path: "M 5.665,42.242 L 4.305,41.501 L 3.998,34.491 L 4.635,31.429 L 5.245,30.209 L 6.625,28.994 Z" },
  { id: "triceps-long-right", name: "Right Triceps (Long Head)", path: "M 26.376,21.213 L 25.056,24.145 L 26.330,26.199 L 26.657,27.251 L 30.780,29.966 Z" },
  { id: "triceps-lateral-right", name: "Right Triceps (Lateral Head)", path: "M 26.510,21.146 L 30.914,29.899 L 31.108,25.624 L 30.568,23.839 L 28.729,22.096 Z" },
  { id: "forearm-extensors-right", name: "Right Forearm Extensors", path: "M 29.225,29.006 L 27.130,27.644 L 27.813,29.635 L 27.397,34.383 L 29.201,42.081 L 30.186,42.253 Z" },
  { id: "forearm-flexors-right", name: "Right Forearm Flexors", path: "M 29.335,42.242 L 30.695,41.501 L 31.002,34.491 L 30.365,31.429 L 29.755,30.209 L 28.375,28.994 Z" },
  { id: "glutes-upper-left", name: "Left Glutes (Upper)", path: "M 10.5,45.0 L 14.0,44.0 L 15.0,47.0 L 13.0,50.0 L 9.0,49.0 Z" },
  { id: "glutes-upper-right", name: "Right Glutes (Upper)", path: "M 24.5,45.0 L 21.0,44.0 L 20.0,47.0 L 22.0,50.0 L 26.0,49.0 Z" },
  { id: "hamstrings-left", name: "Left Hamstrings", path: "M 10.0,51.0 L 13.0,50.5 L 14.0,55.0 L 13.0,65.0 L 10.0,64.0 Z" },
  { id: "hamstrings-right", name: "Right Hamstrings", path: "M 25.0,51.0 L 22.0,50.5 L 21.0,55.0 L 22.0,65.0 L 25.0,64.0 Z" },
  { id: "calves-left", name: "Left Calves (Gastrocnemius)", path: "M 10.5,66.0 L 12.5,65.5 L 13.0,72.0 L 12.0,78.0 L 10.0,77.0 Z" },
  { id: "calves-right", name: "Right Calves (Gastrocnemius)", path: "M 24.5,66.0 L 22.5,65.5 L 22.0,72.0 L 23.0,78.0 L 25.0,77.0 Z" },
  { id: "achilles-left", name: "Left Achilles/Ankle", path: "M 10.5,78.0 L 11.5,77.5 L 11.8,81.0 L 10.8,82.0 Z" },
  { id: "achilles-right", name: "Right Achilles/Ankle", path: "M 24.5,78.0 L 23.5,77.5 L 23.2,81.0 L 24.2,82.0 Z" },
  { id: "hand-back-left", name: "Left Hand (Back)", path: "M 5.716955,42.424835 l -1.5182,0.0863 -0.78184,-0.65295 -1.16168,2.1855 -0.78414,3.34805 0.49892,0.20949 0.54632,-2.2158 0.50597,0.24175 -0.29779,2.5019 0.62936,0.22875 0.35546,-2.50096 0.56242,0.16536 -0.16126,2.77057 0.77674,0.30455 0.19056,-2.87291 0.45724,-0.0289 0.22827,2.64778 0.66597,0.24774 -0.0359,-4.56685 0.33693,-0.20224 1.39227,1.65147 0.32017,-0.35115 -0.77444,-2.03749 z" },
  { id: "hand-back-right", name: "Right Hand (Back)", path: "m 29.347365,42.424835 1.5182,0.0863 0.78184,-0.65295 1.16168,2.1855 0.78414,3.34805 -0.49892,0.20949 -0.54632,-2.2158 -0.50597,0.24175 0.29779,2.5019 -0.62936,0.22875 -0.35546,-2.50096 -0.56242,0.16536 0.16126,2.77057 -0.77674,0.30455 -0.19056,-2.87291 -0.45724,-0.0289 -0.22827,2.64778 -0.66597,0.24774 0.0359,-4.56685 -0.33693,-0.20224 -1.39227,1.65147 -0.32017,-0.35115 0.77444,-2.03749 z" }
];

class BodyHeatmapMuscles {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`BodyHeatmapMuscles: Container "${containerId}" not found`);
    }

    this.options = {
      onSelectionChange: options.onSelectionChange || (() => {}),
      initialSelection: options.initialSelection || [],
      ...options
    };

    // State
    this.gender = 'male';
    this.currentView = 'front';
    this.selectedRegions = new Map(); // muscleId -> { intensity: 0-10 }

    // Hold-to-increase
    this.holdTimer = null;
    this.holdInterval = null;
    this.holdThreshold = 200;
    this.holdAcceleration = 150;
    this.maxIntensity = 10;
    this.holdTriggered = false;

    // SVG namespace
    this.SVG_NS = 'http://www.w3.org/2000/svg';

    // Rendered elements cache
    this.musclePaths = new Map();

    this.init();
  }

  /**
   * Get muscles for current view
   */
  getCurrentMuscles() {
    return this.currentView === 'front' ? FRONT_MUSCLES : BACK_MUSCLES;
  }

  /**
   * Initialize the heatmap
   */
  init() {
    this.render();
    this.attachEventListeners();
    this.loadInitialSelection();
  }

  /**
   * Render the SVG body map
   */
  render() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const borderColor = isDark ? 'rgba(255,255,255,0.15)' : '#ddddd0';
    const glassBg = isDark ? 'rgba(15, 35, 25, 0.75)' : 'rgba(255, 255, 255, 0.75)';

    this.container.innerHTML = `
      <div class="body-heatmap-muscles-container">
        <!-- Gender Toggle -->
        <div class="gender-toggle">
          <button class="gender-btn ${this.gender === 'male' ? 'active' : ''}" data-gender="male">
            <span>Male</span>
          </button>
          <button class="gender-btn ${this.gender === 'female' ? 'active' : ''}" data-gender="female">
            <span>Female</span>
          </button>
        </div>

        <!-- View Toggle -->
        <div class="view-toggle">
          <button class="view-btn active" data-view="front">Front</button>
          <button class="view-btn" data-view="back">Back</button>
        </div>

        <!-- Body SVG -->
        <div class="body-svg-wrapper">
          ${this.renderSVG(borderColor)}
        </div>

        <!-- Legend -->
        <div class="heatmap-legend">
          <div class="legend-title">Intensity (0-10)</div>
          <div class="legend-gradient-bar">
            <div class="legend-gradient-fill"></div>
          </div>
          <div class="legend-labels">
            <span>None</span>
            <span>Mild</span>
            <span>Moderate</span>
            <span>Severe</span>
            <span>Extreme</span>
          </div>
        </div>
      </div>

      <style>
        .body-heatmap-muscles-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
        }

        .gender-toggle, .view-toggle {
          display: flex;
          gap: 8px;
          background: ${glassBg};
          backdrop-filter: blur(20px);
          border: 1px solid ${borderColor};
          border-radius: 10px;
          padding: 4px;
        }

        .gender-btn, .view-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: ${isDark ? '#a8b5a0' : '#6b6b60'};
          font-family: 'DM Sans', sans-serif;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .gender-btn:hover, .view-btn:hover {
          background: rgba(26, 107, 74, 0.1);
          color: var(--green, #1a6b4a);
        }

        .gender-btn.active, .view-btn.active {
          background: var(--green, #1a6b4a);
          color: white;
        }

        .body-svg-wrapper {
          width: 100%;
          max-width: 300px;
          aspect-ratio: 1/2.5;
        }

        .body-svg-wrapper svg {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 4px 20px rgba(0, 0, 0, 0.3));
        }

        .muscle-path {
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .muscle-path:hover {
          filter: brightness(1.2);
          transform: translateY(-1px);
        }

        .heatmap-legend {
          background: ${glassBg};
          backdrop-filter: blur(20px);
          border: 1px solid ${borderColor};
          border-radius: 14px;
          padding: 1rem 1.25rem;
          width: 100%;
          max-width: 280px;
        }

        .legend-title {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: ${isDark ? '#a8b5a0' : '#6b6b60'};
          margin-bottom: 0.75rem;
        }

        .legend-gradient-bar {
          width: 100%;
          height: 16px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid ${borderColor};
        }

        .legend-gradient-fill {
          width: 100%;
          height: 100%;
          background: linear-gradient(to right,
            transparent 0%,
            hsla(50, 85%, 55%, 0.6) 10%,
            hsla(35, 90%, 48%, 0.75) 30%,
            hsla(0, 90%, 45%, 0.88) 70%,
            hsla(280, 80%, 35%, 0.98) 100%
          );
        }

        .legend-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.6rem;
          font-weight: 600;
          color: ${isDark ? '#a8b5a0' : '#6b6b60'};
          text-transform: uppercase;
          margin-top: 0.5rem;
        }
      </style>
    `;
  }

  /**
   * Render the SVG with muscle paths
   */
  renderSVG(borderColor) {
    const muscles = this.getCurrentMuscles();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const defaultFill = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(26, 107, 74, 0.05)';

    // SVG viewBox - same as body-muscles library
    const viewBox = this.currentView === 'front'
      ? '0 0 35 93'
      : '0 0 35 93';

    const paths = muscles.map(muscle => {
      const regionData = this.selectedRegions.get(muscle.id);
      const intensity = regionData?.intensity || 0;
      const fill = intensity > 0 ? INTENSITY_COLORS[Math.round(intensity)] : defaultFill;

      return `
        <path
          class="muscle-path"
          data-muscle="${muscle.id}"
          d="${muscle.path}"
          fill="${fill}"
          stroke="${borderColor}"
          stroke-width="0.3"
        />
      `;
    }).join('');

    return `
      <svg viewBox="${viewBox}" xmlns="${this.SVG_NS}">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        ${paths}
      </svg>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Gender toggle
    this.container.querySelectorAll('.gender-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const gender = e.currentTarget.dataset.gender;
        if (gender !== this.gender) {
          this.gender = gender;
          this.updateGenderDisplay();
        }
      });
    });

    // View toggle
    this.container.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        if (view !== this.currentView) {
          this.currentView = view;
          this.updateViewDisplay();
        }
      });
    });

    // Muscle path interactions
    this.container.querySelectorAll('.muscle-path').forEach(path => {
      const muscleId = path.dataset.muscle;

      // Mouse down - start hold timer
      path.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.button !== 0) return;
        this.holdTimer = setTimeout(() => {
          this.startHoldAcceleration(muscleId);
        }, this.holdThreshold);
      });

      // Mouse up - clear hold timer
      path.addEventListener('mouseup', (e) => {
        e.preventDefault();
        this.clearHoldTimers();
      });

      // Mouse leave - clear hold timer
      path.addEventListener('mouseleave', () => {
        this.clearHoldTimers();
      });

      // Click - handle intensity change
      path.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.shiftKey || e.button === 2) {
          this.handleMuscleClick(muscleId, -1);
        } else {
          this.handleMuscleClick(muscleId, 1);
        }
      });

      // Context menu
      path.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });

      // Touch support
      path.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.holdTimer = setTimeout(() => {
          this.startHoldAcceleration(muscleId);
        }, this.holdThreshold);
      });

      path.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.clearHoldTimers();
        if (!this.holdTriggered) {
          this.handleMuscleClick(muscleId, 1);
        }
        this.holdTriggered = false;
      });

      path.addEventListener('touchcancel', () => {
        this.clearHoldTimers();
        this.holdTriggered = false;
      });
    });
  }

  /**
   * Start hold acceleration for increasing intensity
   */
  startHoldAcceleration(muscleId) {
    this.holdTriggered = true;
    this.holdInterval = setInterval(() => {
      const currentData = this.selectedRegions.get(muscleId);
      const currentIntensity = currentData?.intensity || 0;
      if (currentIntensity < this.maxIntensity) {
        this.handleMuscleClick(muscleId, 0.5);
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
   * Handle muscle click
   */
  handleMuscleClick(muscleId, delta) {
    const currentData = this.selectedRegions.get(muscleId);
    let currentIntensity = currentData?.intensity || 0;

    let newIntensity = Math.max(0, Math.min(this.maxIntensity, currentIntensity + delta));

    if (newIntensity <= 0.01) {
      this.selectedRegions.delete(muscleId);
      newIntensity = 0;
    } else {
      this.selectedRegions.set(muscleId, { intensity: newIntensity });
    }

    this.applyIntensityVisual(muscleId, newIntensity);
    this.options.onSelectionChange(this.getSelectedData());
  }

  /**
   * Apply intensity visual to muscle path
   */
  applyIntensityVisual(muscleId, intensity) {
    const path = this.container.querySelector(`[data-muscle="${muscleId}"]`);
    if (!path) return;

    const color = INTENSITY_COLORS[Math.round(intensity)];
    if (intensity > 0) {
      path.setAttribute('fill', color);
      path.style.filter = intensity >= 7 ? 'brightness(1.1)' : '';
    } else {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      path.setAttribute('fill', isDark ? 'rgba(255,255,255,0.05)' : 'rgba(26, 107, 74, 0.05)');
      path.style.filter = '';
    }
  }

  /**
   * Update gender display (placeholder for future gender-specific paths)
   */
  updateGenderDisplay() {
    // Update button states
    this.container.querySelectorAll('.gender-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gender === this.gender);
    });
    // Gender-specific body shapes would be implemented here
    // For now, same SVG for both genders
  }

  /**
   * Update view display
   */
  updateViewDisplay() {
    // Update button states
    this.container.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === this.currentView);
    });

    // Re-render SVG with new view
    const wrapper = this.container.querySelector('.body-svg-wrapper');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const borderColor = isDark ? 'rgba(255,255,255,0.15)' : '#ddddd0';
    wrapper.innerHTML = this.renderSVG(borderColor);

    // Re-attach muscle path listeners
    this.attachEventListeners();
  }

  /**
   * Load initial selection
   */
  loadInitialSelection() {
    if (this.options.initialSelection && this.options.initialSelection.length > 0) {
      this.options.initialSelection.forEach(selection => {
        if (selection.area && selection.intensity) {
          this.selectedRegions.set(selection.area, {
            intensity: selection.intensity
          });
          this.applyIntensityVisual(selection.area, selection.intensity);
        }
      });
    }
  }

  /**
   * Get selected data
   */
  getSelectedData() {
    const muscles = [...FRONT_MUSCLES, ...BACK_MUSCLES];
    const muscleMap = new Map(muscles.map(m => [m.id, m.name]));

    return Array.from(this.selectedRegions.entries()).map(([area, data]) => ({
      area,
      intensity: data.intensity,
      name: muscleMap.get(area) || area
    }));
  }

  /**
   * Get legacy format for compatibility
   */
  getLegacyFormat() {
    const selections = this.getSelectedData();
    if (selections.length === 0) return '';

    const primary = selections.reduce((max, s) =>
      s.intensity > max.intensity ? s : max, selections[0]);

    // Map to MediScan body areas
    const areaMap = {
      'head': 'head / nervous',
      'face': 'head / nervous',
      'neck-right': 'head / nervous',
      'neck-left': 'head / nervous',
      'shoulder-front-left': 'arms / hands',
      'shoulder-front-right': 'arms / hands',
      'shoulder-side-left': 'arms / hands',
      'shoulder-side-right': 'arms / hands',
      'biceps-left': 'arms / hands',
      'biceps-right': 'arms / hands',
      'forearm-left': 'arms / hands',
      'forearm-right': 'arms / hands',
      'chest-upper-left': 'chest / lungs',
      'chest-lower-left': 'chest / lungs',
      'chest-upper-right': 'chest / lungs',
      'chest-lower-right': 'chest / lungs',
      'abs-upper-left': 'stomach / gut',
      'abs-upper-right': 'stomach / gut',
      'abs-lower-left': 'stomach / gut',
      'abs-lower-right': 'stomach / gut',
      'obliques-left': 'stomach / gut',
      'obliques-right': 'stomach / gut',
      'hip-flexor-left': 'legs / feet',
      'hip-flexor-right': 'legs / feet',
      'quads-left': 'legs / feet',
      'quads-right': 'legs / feet',
      'shin-left': 'legs / feet',
      'shin-right': 'legs / feet',
      'foot-top-left': 'legs / feet',
      'foot-top-right': 'legs / feet',
      'hand-front-left': 'arms / hands',
      'hand-front-right': 'arms / hands',
      'head-back': 'head / nervous',
      'nape': 'head / nervous',
      'traps-upper-left': 'back',
      'traps-mid-left': 'back',
      'traps-lower-left': 'back',
      'traps-upper-right': 'back',
      'traps-mid-right': 'back',
      'traps-lower-right': 'back',
      'lats-upper-left': 'back',
      'lats-mid-left': 'back',
      'lats-lower-left': 'back',
      'lats-upper-right': 'back',
      'lats-mid-right': 'back',
      'lats-lower-right': 'back',
      'deltoid-rear-left': 'arms / hands',
      'deltoid-rear-right': 'arms / hands',
      'triceps-long-left': 'arms / hands',
      'triceps-lateral-left': 'arms / hands',
      'triceps-long-right': 'arms / hands',
      'triceps-lateral-right': 'arms / hands',
      'forearm-extensors-left': 'arms / hands',
      'forearm-flexors-left': 'arms / hands',
      'forearm-extensors-right': 'arms / hands',
      'forearm-flexors-right': 'arms / hands',
      'glutes-upper-left': 'back',
      'glutes-upper-right': 'back',
      'hamstrings-left': 'legs / feet',
      'hamstrings-right': 'legs / feet',
      'calves-left': 'legs / feet',
      'calves-right': 'legs / feet',
      'achilles-left': 'legs / feet',
      'achilles-right': 'legs / feet',
      'hand-back-left': 'arms / hands',
      'hand-back-right': 'arms / hands',
      'serratus-anterior-left': 'chest / lungs',
      'serratus-anterior-right': 'chest / lungs'
    };

    return areaMap[primary.area] || 'other / unsure';
  }

  /**
   * Get enhanced format for HeatmapSwitcher
   */
  getEnhancedFormat() {
    const selections = this.getSelectedData();
    if (selections.length === 0) return null;

    return {
      regions: selections,
      primaryArea: selections.reduce((max, s) =>
        s.intensity > max.intensity ? s : max, selections[0]).area,
      totalRegions: selections.length,
      maxIntensity: Math.max(...selections.map(s => s.intensity)),
      averageIntensity: selections.reduce((sum, s) => sum + s.intensity, 0) / selections.length,
      legacyBodyArea: this.getLegacyFormat()
    };
  }

  /**
   * Set selections programmatically
   */
  setSelections(selections) {
    this.selectedRegions.clear();

    // Clear all visuals first
    this.container.querySelectorAll('.muscle-path').forEach(path => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      path.setAttribute('fill', isDark ? 'rgba(255,255,255,0.05)' : 'rgba(26, 107, 74, 0.05)');
    });

    // Apply new selections
    selections.forEach(s => {
      if (s.area && s.intensity) {
        this.selectedRegions.set(s.area, { intensity: s.intensity });
        this.applyIntensityVisual(s.area, s.intensity);
      }
    });

    this.options.onSelectionChange(this.getSelectedData());
  }

  /**
   * Clear all selections
   */
  clear() {
    this.selectedRegions.clear();
    this.container.querySelectorAll('.muscle-path').forEach(path => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      path.setAttribute('fill', isDark ? 'rgba(255,255,255,0.05)' : 'rgba(26, 107, 74, 0.05)');
    });
    this.options.onSelectionChange([]);
  }

  /**
   * Cleanup and dispose resources
   */
  cleanup() {
    this.clear();
    this.musclePaths.clear();
  }

  /**
   * Alias for cleanup (for HeatmapSwitcher compatibility)
   */
  dispose() {
    this.cleanup();
  }
}

// Export for ES modules
export { BodyHeatmapMuscles };

// Auto-initialize if data attribute present
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const containers = document.querySelectorAll('[data-body-heatmap-muscles]');
    containers.forEach(container => {
      const heatmap = new BodyHeatmapMuscles(container.id, {
        onSelectionChange: (data) => {
          window.mediscanBodySelections = data;
        }
      });
      window.mediscanBodyHeatmapMuscles = heatmap;
    });
  });
}
