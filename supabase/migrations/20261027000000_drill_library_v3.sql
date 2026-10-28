-- Drill library v3: every practice area gets at least 3 active drills; adds on-course, rug-length and range warm-up drills.
-- Additive. Run in the Supabase SQL editor.

insert into public.drill_library (name, category, description, target_area, difficulty, reps_suggested, time_estimate_mins, instructions, equipment_needed, practice_category, locations, equipment, structure, pressure, metric, lower_is_better, sets, levels, cue, routine_rule, source_url, status)
select name, category, description, target_area, difficulty, reps_suggested, time_estimate_mins, instructions, equipment_needed, practice_category, locations, equipment, structure, pressure, metric, lower_is_better, sets, levels, cue, routine_rule, source_url, status
from jsonb_to_recordset($seed$
[
  {
    "name": "Wide-Narrow Fairway",
    "category": "off_tee",
    "practice_category": "tee",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 20,
    "time_estimate_mins": 20,
    "description": "Drivers at a wide fairway, then a narrow one.",
    "target_area": "fairways",
    "instructions": "Set a wide target pair 40 yards apart and a narrow pair 25 yards apart. Hit 10 drivers at the wide fairway, then 10 at the narrow one. Count the balls that finish between the targets.",
    "equipment_needed": "driver, balls, range",
    "equipment": "driver, balls, range",
    "structure": "blocked",
    "pressure": 0,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Wide, 40 yd",
        "setup": "10 drivers between targets 40 yd apart; count the balls inside",
        "balls": 10
      },
      {
        "label": "Narrow, 25 yd",
        "setup": "10 drivers between targets 25 yd apart; count the balls inside",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "Wide 6, narrow 4",
        "rule": "6 of 10 wide and 4 of 10 narrow"
      },
      {
        "name": "Wide 7, narrow 5",
        "rule": "7 of 10 wide and 5 of 10 narrow"
      },
      {
        "name": "Wide 8, narrow 6",
        "rule": "8 of 10 wide and 6 of 10 narrow"
      }
    ],
    "cue": "Start the ball down the middle of the fairway you set.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Stock Shot Call",
    "category": "off_tee",
    "practice_category": "tee",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 18,
    "time_estimate_mins": 20,
    "description": "Call the shape before every swing, then play it.",
    "target_area": "shot shape",
    "instructions": "Pick a target. Before each swing call one of three shapes: draw, straight or fade. Hit 18 balls, 6 of each shape. Count the balls that end on the shape you called and inside the corridor.",
    "equipment_needed": "driver or 3 wood, balls, range",
    "equipment": "driver or 3 wood, balls, range",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Draws",
        "setup": "6 calls of a draw; count the matches",
        "balls": 6
      },
      {
        "label": "Straights",
        "setup": "6 calls of a straight shot; count the matches",
        "balls": 6
      },
      {
        "label": "Fades",
        "setup": "6 calls of a fade; count the matches",
        "balls": 6
      }
    ],
    "levels": [
      {
        "name": "8 of 18",
        "rule": "8 balls match the call and finish in the corridor"
      },
      {
        "name": "10 of 18",
        "rule": "10 balls match the call and finish in the corridor"
      },
      {
        "name": "12 of 18",
        "rule": "12 balls match the call and finish in the corridor"
      }
    ],
    "cue": "Start the ball on the line and shape it to the call.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Wedge Ladder",
    "category": "approach",
    "practice_category": "wedges",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 20,
    "time_estimate_mins": 20,
    "description": "Four wedge distances, scored by how close each lands.",
    "target_area": "wedge distances",
    "instructions": "Hit 5 balls each to 40, 55, 70 and 85 yards, one distance at a time. Score each ball by carry error: inside 3 yd is 2 points, inside 6 yd is 1, otherwise 0. Log the total out of 40.",
    "equipment_needed": "wedges, balls, yardage targets",
    "equipment": "wedges, balls, yardage targets",
    "structure": "blocked",
    "pressure": 0,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "40 yd",
        "setup": "5 balls; score by distance from the target",
        "balls": 5
      },
      {
        "label": "55 yd",
        "setup": "5 balls; score by distance from the target",
        "balls": 5
      },
      {
        "label": "70 yd",
        "setup": "5 balls; score by distance from the target",
        "balls": 5
      },
      {
        "label": "85 yd",
        "setup": "5 balls; score by distance from the target",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "20 points",
        "rule": "20 of 40 points"
      },
      {
        "name": "26 points",
        "rule": "26 of 40 points"
      },
      {
        "name": "32 points",
        "rule": "32 of 40 points"
      }
    ],
    "cue": "Land each ball on the number for that distance.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Called Wedge Distances",
    "category": "approach",
    "practice_category": "wedges",
    "locations": [
      "range",
      "home_net",
      "simulator"
    ],
    "difficulty": "advanced",
    "reps_suggested": 20,
    "time_estimate_mins": 20,
    "description": "A partner or the app calls a random distance for every ball.",
    "target_area": "wedge distances",
    "instructions": "Have a partner (or a random-number app) call a distance between 30 and 100 yards for each ball. Pick the wedge and length, then hit. Count the balls that finish within 10% of the call.",
    "equipment_needed": "wedges, balls, partner or random-number app",
    "equipment": "wedges, balls, partner or random-number app",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Called set 1",
        "setup": "10 random distances; count the shots within 10%",
        "balls": 10
      },
      {
        "label": "Called set 2",
        "setup": "10 random distances; count the shots within 10%",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "Within 10%, 8 of 20",
        "rule": "8 of 20 within 10% of the call"
      },
      {
        "name": "Within 10%, 11 of 20",
        "rule": "11 of 20 within 10% of the call"
      },
      {
        "name": "Within 7%, 11 of 20",
        "rule": "11 of 20 within 7% of the call"
      }
    ],
    "cue": "Land the ball on the number you were given.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Rug Speed Ladder",
    "category": "putting",
    "practice_category": "lag_putting",
    "locations": [
      "home_net"
    ],
    "difficulty": "beginner",
    "reps_suggested": 15,
    "time_estimate_mins": 10,
    "description": "Three stops on a 9-12 ft rug.",
    "target_area": "lag",
    "instructions": "Mark the rug at 6, 9 and 12 feet, or the longest you have. Roll 5 balls to each mark, aiming to stop inside a putter-length of it. Count the balls that stop inside.",
    "equipment_needed": "putter, balls, 3 tees or coins",
    "equipment": "putter, balls, 3 tees or coins",
    "structure": "blocked",
    "pressure": 0,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "6 ft",
        "setup": "5 balls; count those stopping within a putter-length",
        "balls": 5
      },
      {
        "label": "9 ft",
        "setup": "5 balls; count those stopping within a putter-length",
        "balls": 5
      },
      {
        "label": "12 ft",
        "setup": "5 balls; count those stopping within a putter-length",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "8 of 15",
        "rule": "8 of 15 inside a putter-length"
      },
      {
        "name": "10 of 15",
        "rule": "10 of 15 inside a putter-length"
      },
      {
        "name": "12 of 15",
        "rule": "12 of 15 inside a putter-length"
      }
    ],
    "cue": "Roll each ball to stop at the mark.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Rug 3-6-9 Circles",
    "category": "putting",
    "practice_category": "lag_putting",
    "locations": [
      "home_net"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 9,
    "time_estimate_mins": 10,
    "description": "Rings at 3, 6 and 9 feet on the rug.",
    "target_area": "lag",
    "instructions": "Mark a target and circles at 3, 6 and 9 feet. Roll 3 balls from each circle, then putt out everything. Log total putts for the nine balls.",
    "equipment_needed": "putter, balls, coins",
    "equipment": "putter, balls, coins",
    "structure": "random",
    "pressure": 1,
    "metric": "strokes",
    "lower_is_better": true,
    "sets": [
      {
        "label": "3 ft",
        "setup": "3 balls, hole out",
        "balls": 3
      },
      {
        "label": "6 ft",
        "setup": "3 balls, hole out",
        "balls": 3
      },
      {
        "label": "9 ft",
        "setup": "3 balls, hole out",
        "balls": 3
      }
    ],
    "levels": [
      {
        "name": "16 putts",
        "rule": "Finish the nine balls in 16 putts or fewer"
      },
      {
        "name": "14 putts",
        "rule": "Finish the nine balls in 14 putts or fewer"
      },
      {
        "name": "13 putts",
        "rule": "Finish the nine balls in 13 putts or fewer"
      }
    ],
    "cue": "Roll each ball into the back of the target.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Rug Gate",
    "category": "putting",
    "practice_category": "short_putting",
    "locations": [
      "home_net"
    ],
    "difficulty": "beginner",
    "reps_suggested": 20,
    "time_estimate_mins": 10,
    "description": "Start-line gate on a short rug.",
    "target_area": "start line",
    "instructions": "Set two tees or coins just wider than the putter head about 2 feet from the ball. Roll 20 putts from 6 to 9 feet through the gate to the target. Count clean passes.",
    "equipment_needed": "putter, balls, 2 tees or coins",
    "equipment": "putter, balls, 2 tees or coins",
    "structure": "blocked",
    "pressure": 0,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Gate",
        "setup": "20 putts through the gate; count clean passes",
        "balls": 20
      }
    ],
    "levels": [
      {
        "name": "12 of 20",
        "rule": "12 of 20 pass cleanly"
      },
      {
        "name": "15 of 20",
        "rule": "15 of 20 pass cleanly"
      },
      {
        "name": "18 of 20",
        "rule": "18 of 20 pass cleanly"
      }
    ],
    "cue": "Roll the ball along the start line through the gate.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://www.golfdigest.com/story/tiger-woods-putting-drill-gate-two-tees",
    "status": "active"
  },
  {
    "name": "Rug Make Streak",
    "category": "putting",
    "practice_category": "short_putting",
    "locations": [
      "home_net"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 10,
    "time_estimate_mins": 10,
    "description": "Back-to-back makes from 3 feet on a rug.",
    "target_area": "short putts",
    "instructions": "Set a cup or coin target 3 feet away. Make putts in a row; a miss restarts the count. Log your best streak in ten minutes.",
    "equipment_needed": "putter, balls, cup or coin",
    "equipment": "putter, balls, cup or coin",
    "structure": "blocked",
    "pressure": 2,
    "metric": "streak",
    "lower_is_better": false,
    "sets": [
      {
        "label": "3 ft streak",
        "setup": "A miss restarts the streak",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "5 in a row",
        "rule": "Best streak of 5 from 3 ft"
      },
      {
        "name": "8 in a row",
        "rule": "Best streak of 8 from 3 ft"
      },
      {
        "name": "12 in a row",
        "rule": "Best streak of 12 from 3 ft"
      }
    ],
    "cue": "Roll each putt into the back of the target.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Nine Holes From 100",
    "category": "approach",
    "practice_category": "wedges",
    "locations": [
      "course"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 9,
    "time_estimate_mins": 60,
    "description": "Play nine holes starting 100 yards from each green.",
    "target_area": "scoring",
    "instructions": "On the course, drop a ball 100 yards from the green on each of nine holes. Play it out and log strokes to hole out.",
    "equipment_needed": "wedges, putter, balls",
    "equipment": "wedges, putter, balls",
    "structure": "random",
    "pressure": 1,
    "metric": "strokes",
    "lower_is_better": true,
    "sets": [
      {
        "label": "Nine holes",
        "setup": "One ball per hole from 100 yd; play out",
        "balls": 9
      }
    ],
    "levels": [
      {
        "name": "36 strokes",
        "rule": "36 strokes or fewer"
      },
      {
        "name": "33 strokes",
        "rule": "33 strokes or fewer"
      },
      {
        "name": "30 strokes",
        "rule": "30 strokes or fewer"
      }
    ],
    "cue": "Pick the landing spot and send the ball at it.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Worst-Ball Par 3s",
    "category": "approach",
    "practice_category": "approach",
    "locations": [
      "course"
    ],
    "difficulty": "advanced",
    "reps_suggested": 6,
    "time_estimate_mins": 60,
    "description": "Hit two balls on each par 3 and play the worse one.",
    "target_area": "approach",
    "instructions": "On the par 3s, hit two tee shots and play the worse ball. Log strokes to hole out over up to six par 3s.",
    "equipment_needed": "full bag, balls",
    "equipment": "full bag, balls",
    "structure": "random",
    "pressure": 2,
    "metric": "strokes",
    "lower_is_better": true,
    "sets": [
      {
        "label": "Par 3s",
        "setup": "Two balls off the tee, play the worse one",
        "balls": 6
      }
    ],
    "levels": [
      {
        "name": "24 strokes",
        "rule": "24 strokes or fewer over 6 par 3s"
      },
      {
        "name": "22 strokes",
        "rule": "22 strokes or fewer over 6 par 3s"
      },
      {
        "name": "20 strokes",
        "rule": "20 strokes or fewer over 6 par 3s"
      }
    ],
    "cue": "Send each ball at the middle of the green.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Six-Green Up-and-Down",
    "category": "short_game",
    "practice_category": "short_game",
    "locations": [
      "course"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 6,
    "time_estimate_mins": 45,
    "description": "Chip and putt from around six greens.",
    "target_area": "scrambling",
    "instructions": "Drop a ball in a different greenside spot at each of six greens. Chip, then putt out. Count the up-and-downs.",
    "equipment_needed": "wedges, putter, balls",
    "equipment": "wedges, putter, balls",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Six greens",
        "setup": "One ball per green; count the up-and-downs",
        "balls": 6
      }
    ],
    "levels": [
      {
        "name": "3 of 6",
        "rule": "Get up and down 3 of 6"
      },
      {
        "name": "4 of 6",
        "rule": "Get up and down 4 of 6"
      },
      {
        "name": "5 of 6",
        "rule": "Get up and down 5 of 6"
      }
    ],
    "cue": "Pick a landing spot and let the ball release to the hole.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Range Warm-Up",
    "category": "approach",
    "practice_category": "warmup",
    "locations": [
      "range"
    ],
    "difficulty": "beginner",
    "reps_suggested": 12,
    "time_estimate_mins": 10,
    "description": "Short to long, one ball at a time.",
    "target_area": "warm-up",
    "instructions": "Hit 3 balls with a wedge, 3 with a 7 iron, 3 with a fairway wood and 3 with the driver. Keep the tempo easy; count the balls that finish inside a 30-yd window.",
    "equipment_needed": "wedge, 7 iron, fairway wood, driver, balls",
    "equipment": "wedge, 7 iron, fairway wood, driver, balls",
    "structure": "blocked_serial_random",
    "pressure": 0,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Wedge",
        "setup": "3 balls to a target",
        "balls": 3
      },
      {
        "label": "7 iron",
        "setup": "3 balls to a target",
        "balls": 3
      },
      {
        "label": "Fairway wood",
        "setup": "3 balls to a target",
        "balls": 3
      },
      {
        "label": "Driver",
        "setup": "3 balls to a target",
        "balls": 3
      }
    ],
    "levels": [
      {
        "name": "6 of 12",
        "rule": "6 of 12 inside the window"
      },
      {
        "name": "8 of 12",
        "rule": "8 of 12 inside the window"
      },
      {
        "name": "10 of 12",
        "rule": "10 of 12 inside the window"
      }
    ],
    "cue": "Swing at an easy, even pace to the target.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Rug Stroke Warm-Up",
    "category": "putting",
    "practice_category": "warmup",
    "locations": [
      "home_net"
    ],
    "difficulty": "beginner",
    "reps_suggested": 10,
    "time_estimate_mins": 5,
    "description": "Short putts to open the stroke.",
    "target_area": "short putts",
    "instructions": "Roll 5 putts from 3 feet and 5 from 6 feet to a coin. Count the balls that stop within a putter-length.",
    "equipment_needed": "putter, balls, coin",
    "equipment": "putter, balls, coin",
    "structure": "blocked",
    "pressure": 0,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "3 ft",
        "setup": "5 putts",
        "balls": 5
      },
      {
        "label": "6 ft",
        "setup": "5 putts",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "6 of 10",
        "rule": "6 of 10 within a putter-length"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 within a putter-length"
      },
      {
        "name": "9 of 10",
        "rule": "9 of 10 within a putter-length"
      }
    ],
    "cue": "Roll each ball to the coin.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Two-Footer Streak",
    "category": "putting",
    "practice_category": "closeout",
    "locations": [
      "putting_green",
      "home_net"
    ],
    "difficulty": "beginner",
    "reps_suggested": 10,
    "time_estimate_mins": 5,
    "description": "A streak from two feet to end the session.",
    "target_area": "short putts",
    "instructions": "Putt from 2 feet. Make 10 in a row to finish; a miss restarts. Log the total putts it took.",
    "equipment_needed": "putter, balls",
    "equipment": "putter, balls",
    "structure": "blocked",
    "pressure": 2,
    "metric": "strokes",
    "lower_is_better": true,
    "sets": [
      {
        "label": "2 ft",
        "setup": "10 makes in a row; a miss restarts",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "25 putts",
        "rule": "Finish in 25 putts or fewer"
      },
      {
        "name": "18 putts",
        "rule": "Finish in 18 putts or fewer"
      },
      {
        "name": "14 putts",
        "rule": "Finish in 14 putts or fewer"
      }
    ],
    "cue": "Roll each putt into the back of the cup.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "original",
    "status": "active"
  },
  {
    "name": "Three-Putt Free",
    "category": "putting",
    "practice_category": "closeout",
    "locations": [
      "putting_green"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 9,
    "time_estimate_mins": 5,
    "description": "Nine long putts without a three-putt.",
    "target_area": "lag",
    "instructions": "Putt 9 balls from random 20-40 ft spots, each as one hole. Log the number of three-putts.",
    "equipment_needed": "putter, balls",
    "equipment": "putter, balls",
    "structure": "random",
    "pressure": 2,
    "metric": "count_of_n",
    "lower_is_better": true,
    "sets": [
      {
        "label": "Nine holes",
        "setup": "One ball per spot; count three-putts",
        "balls": 9
      }
    ],
    "levels": [
      {
        "name": "2 or fewer",
        "rule": "2 or fewer three-putts"
      },
      {
        "name": "1 or fewer",
        "rule": "1 or fewer three-putts"
      },
      {
        "name": "None",
        "rule": "No three-putts"
      }
    ],
    "cue": "Roll each ball to stop just past the hole.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "original",
    "status": "active"
  }
]
$seed$::jsonb) as s(name text, category text, description text, target_area text, difficulty text, reps_suggested integer, time_estimate_mins integer, instructions text, equipment_needed text, practice_category text, locations text[], equipment text, structure text, pressure smallint, metric text, lower_is_better boolean, sets jsonb, levels jsonb, cue text, routine_rule text, source_url text, status text)
on conflict (name) do nothing;
