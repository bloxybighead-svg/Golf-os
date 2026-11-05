-- Drill library v4: 32 named, scored drills, from tour practice routines, across every practice area.
-- Additive: a drill whose name is already in the library is skipped.

insert into public.drill_library (name, category, description, target_area, difficulty, reps_suggested, time_estimate_mins, instructions, equipment_needed, practice_category, locations, equipment, structure, pressure, metric, lower_is_better, sets, levels, cue, routine_rule, source_url, status)
select name, category, description, target_area, difficulty, reps_suggested, time_estimate_mins, instructions, equipment_needed, practice_category, locations, equipment, structure, pressure, metric, lower_is_better, sets, levels, cue, routine_rule, source_url, status
from jsonb_to_recordset($seed$
[
  {
    "name": "One-Hand Gate",
    "category": "putting",
    "practice_category": "short_putting",
    "locations": [
      "putting_green",
      "home_net"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 20,
    "time_estimate_mins": 10,
    "description": "Gate putts with the trail hand alone, then with both hands.",
    "target_area": "start line",
    "instructions": "Set two tees just wider than the putter head and a target 5 feet away. Putt 10 balls using only your trail hand, then 10 with both hands. Count the balls that roll through the gate and finish in the cup or on the target.",
    "equipment_needed": "putter, balls, 2 tees",
    "equipment": "putter, balls, 2 tees",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Trail hand only",
        "setup": "10 putts from 5 ft through the gate; count the makes",
        "balls": 10
      },
      {
        "label": "Two hands",
        "setup": "10 putts from 5 ft through the gate; count the makes",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "12 of 20",
        "rule": "12 of 20 roll through the gate and finish on target"
      },
      {
        "name": "15 of 20",
        "rule": "15 of 20 roll through the gate and finish on target"
      },
      {
        "name": "18 of 20",
        "rule": "18 of 20 roll through the gate and finish on target"
      }
    ],
    "cue": "Roll each ball through the gate into the back of the cup.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/news/tournaments/use-tiger-woodss-ryder-cup-putting-drill-to-help-your-game/",
    "status": "active"
  },
  {
    "name": "Mickelson 100",
    "category": "putting",
    "practice_category": "short_putting",
    "locations": [
      "putting_green",
      "home_net"
    ],
    "difficulty": "advanced",
    "reps_suggested": 10,
    "time_estimate_mins": 15,
    "description": "Ten tees around a 3-foot circle: make a lap without a miss.",
    "target_area": "short putts",
    "instructions": "Push 10 tees into a circle 3 feet from the hole, or from a target on a rug. Putt from each tee in turn and keep going around the circle. A miss restarts the count; log your best streak.",
    "equipment_needed": "putter, balls, 10 tees",
    "equipment": "putter, balls, 10 tees",
    "structure": "blocked",
    "pressure": 2,
    "metric": "streak",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Around the circle",
        "setup": "10 spots on a 3 ft circle; a miss restarts the streak",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "25 in a row",
        "rule": "Best streak of 25 from 3 ft"
      },
      {
        "name": "50 in a row",
        "rule": "Best streak of 50 from 3 ft"
      },
      {
        "name": "100 in a row",
        "rule": "Best streak of 100 from 3 ft"
      }
    ],
    "cue": "Roll each putt into the back of the cup.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/instruction/phil-mickelson-key-3-footer-play-smart/",
    "status": "active"
  },
  {
    "name": "Donald 4-to-8",
    "category": "putting",
    "practice_category": "short_putting",
    "locations": [
      "putting_green"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 20,
    "time_estimate_mins": 15,
    "description": "One putt at each distance from 4 to 8 feet, around four holes.",
    "target_area": "short putts",
    "instructions": "On four different holes, place balls at 4, 5, 6, 7 and 8 feet. Putt all five at each hole. Count the putts you hole out of 20.",
    "equipment_needed": "putter, 20 balls, tees",
    "equipment": "putter, 20 balls, tees",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Hole 1",
        "setup": "5 putts at 4, 5, 6, 7 and 8 ft; count the makes",
        "balls": 5
      },
      {
        "label": "Hole 2",
        "setup": "5 putts at 4, 5, 6, 7 and 8 ft; count the makes",
        "balls": 5
      },
      {
        "label": "Hole 3",
        "setup": "5 putts at 4, 5, 6, 7 and 8 ft; count the makes",
        "balls": 5
      },
      {
        "label": "Hole 4",
        "setup": "5 putts at 4, 5, 6, 7 and 8 ft; count the makes",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "10 of 20",
        "rule": "10 of 20 holed"
      },
      {
        "name": "13 of 20",
        "rule": "13 of 20 holed"
      },
      {
        "name": "16 of 20",
        "rule": "16 of 20 holed"
      }
    ],
    "cue": "Roll each putt into the back of the cup.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/instruction/putting/luke-donald-putting-drill-dead-eye-putter",
    "status": "active"
  },
  {
    "name": "Spieth Circle",
    "category": "putting",
    "practice_category": "short_putting",
    "locations": [
      "putting_green"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 20,
    "time_estimate_mins": 15,
    "description": "Putts from all four sides of the hole at 4 to 9 feet.",
    "target_area": "short putts",
    "instructions": "Pick a hole and putt from the north, south, east and west sides, 5 putts from each at distances between 4 and 9 feet. Change the distance on every ball. Count the putts you hole out of 20.",
    "equipment_needed": "putter, 20 balls, tees",
    "equipment": "putter, 20 balls, tees",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "North",
        "setup": "5 putts at 4-9 ft; count the makes",
        "balls": 5
      },
      {
        "label": "South",
        "setup": "5 putts at 4-9 ft; count the makes",
        "balls": 5
      },
      {
        "label": "East",
        "setup": "5 putts at 4-9 ft; count the makes",
        "balls": 5
      },
      {
        "label": "West",
        "setup": "5 putts at 4-9 ft; count the makes",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "12 of 20",
        "rule": "12 of 20 holed"
      },
      {
        "name": "15 of 20",
        "rule": "15 of 20 holed"
      },
      {
        "name": "17 of 20",
        "rule": "17 of 20 holed"
      }
    ],
    "cue": "Roll each putt into the back of the cup.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/instruction/putting/jordan-spieth-reveals-practice-putting-routine/",
    "status": "active"
  },
  {
    "name": "Distraction Putts",
    "category": "putting",
    "practice_category": "short_putting",
    "locations": [
      "putting_green",
      "home_net"
    ],
    "difficulty": "advanced",
    "reps_suggested": 10,
    "time_estimate_mins": 10,
    "description": "Five-footers while a partner makes noise and movement.",
    "target_area": "short putts",
    "instructions": "Putt 10 balls from 5 feet. Your partner jingles coins or rolls a ball through your view while you set up and putt. Count the putts you hole or land on the target.",
    "equipment_needed": "putter, balls, partner, coins",
    "equipment": "putter, balls, partner, coins",
    "structure": "blocked",
    "pressure": 2,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Five-footers",
        "setup": "10 putts from 5 ft with a partner distracting; count the makes",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "6 of 10",
        "rule": "6 of 10 made"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 made"
      },
      {
        "name": "10 of 10",
        "rule": "10 of 10 made"
      }
    ],
    "cue": "Roll each putt into the back of the cup, whatever is going on around you.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/?p=15467473",
    "status": "active"
  },
  {
    "name": "Line Ball Roll",
    "category": "putting",
    "practice_category": "short_putting",
    "locations": [
      "putting_green",
      "home_net"
    ],
    "difficulty": "beginner",
    "reps_suggested": 10,
    "time_estimate_mins": 10,
    "description": "Ten flat 10-foot putts with a lined ball, rolled end over end.",
    "target_area": "roll quality",
    "instructions": "Draw a line around a ball, or use one with a printed line. Set it with the line along your start line and putt 10 flat putts from 10 feet. Count the putts where the line stays on its line and the ball rolls end over end.",
    "equipment_needed": "putter, balls with a line drawn on them",
    "equipment": "putter, balls with a line drawn on them",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Ten-footers",
        "setup": "10 flat putts from 10 ft; count the end-over-end rolls",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "5 of 10",
        "rule": "5 of 10 roll end over end"
      },
      {
        "name": "7 of 10",
        "rule": "7 of 10 roll end over end"
      },
      {
        "name": "9 of 10",
        "rule": "9 of 10 roll end over end"
      }
    ],
    "cue": "Roll the ball so the line spins end over end toward the hole.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://www.todaysgolfer.co.uk/news-and-events/tour-news/2015/january/secrets-in-the-dirt/",
    "status": "active"
  },
  {
    "name": "Chalk Line Start",
    "category": "putting",
    "practice_category": "short_putting",
    "locations": [
      "putting_green",
      "home_net"
    ],
    "difficulty": "beginner",
    "reps_suggested": 10,
    "time_estimate_mins": 10,
    "description": "Six-footers along a chalk line: the ball must start on it.",
    "target_area": "start line",
    "instructions": "Lay a chalk or string line 6 feet long from the ball to the hole or target. Putt 10 balls along it. Count the balls that start on the line.",
    "equipment_needed": "putter, balls, chalk or string",
    "equipment": "putter, balls, chalk or string",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Six-footers",
        "setup": "10 putts from 6 ft along the line; count the balls that start on it",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "6 of 10",
        "rule": "6 of 10 start on the line"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 start on the line"
      },
      {
        "name": "10 of 10",
        "rule": "10 of 10 start on the line"
      }
    ],
    "cue": "Send the ball down the line and into the cup.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/instruction/how-scottie-scheffler-warms-up/",
    "status": "active"
  },
  {
    "name": "Spieth 10-ft Game",
    "category": "putting",
    "practice_category": "lag_putting",
    "locations": [
      "putting_green"
    ],
    "difficulty": "advanced",
    "reps_suggested": 80,
    "time_estimate_mins": 20,
    "description": "Four stations of ten putts from 10 feet, scored in points.",
    "target_area": "lag",
    "instructions": "Use four different 10-foot putts, 10 balls at each. Score each putt: holed is 2 points, finishing under 2 feet past the hole is 1, short or 2 or more feet past is 0. Log the points for each station out of 20.",
    "equipment_needed": "putter, 40 balls, tees",
    "equipment": "putter, 40 balls, tees",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Station 1",
        "setup": "10 putts from 10 ft; make 2, under 2 ft past 1, short or 2+ ft past 0",
        "balls": 20
      },
      {
        "label": "Station 2",
        "setup": "10 putts from 10 ft; make 2, under 2 ft past 1, short or 2+ ft past 0",
        "balls": 20
      },
      {
        "label": "Station 3",
        "setup": "10 putts from 10 ft; make 2, under 2 ft past 1, short or 2+ ft past 0",
        "balls": 20
      },
      {
        "label": "Station 4",
        "setup": "10 putts from 10 ft; make 2, under 2 ft past 1, short or 2+ ft past 0",
        "balls": 20
      }
    ],
    "levels": [
      {
        "name": "40 of 80 points",
        "rule": "40 of 80 points"
      },
      {
        "name": "42 of 80 points",
        "rule": "42 of 80 points"
      },
      {
        "name": "44 of 80 points",
        "rule": "44 of 80 points, the score Spieth calls 4-under"
      }
    ],
    "cue": "Roll each putt to finish just past the hole.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/instruction/putting/jordan-spieth-reveals-practice-putting-routine/",
    "status": "active"
  },
  {
    "name": "Spieth Gate Points",
    "category": "putting",
    "practice_category": "lag_putting",
    "locations": [
      "putting_green"
    ],
    "difficulty": "advanced",
    "reps_suggested": 15,
    "time_estimate_mins": 15,
    "description": "Five long putts, each scored for line, speed and the make.",
    "target_area": "lag",
    "instructions": "Set two markers a putter-head apart halfway to the hole and putt 5 balls from 10 to 25 feet. Score each ball: 1 point for rolling through the gate, 1 for good speed, 1 for holing it. Log the points out of 15.",
    "equipment_needed": "putter, balls, 2 tees",
    "equipment": "putter, balls, 2 tees",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Five long putts",
        "setup": "5 putts at 10-25 ft; 1 pt through the gate, 1 pt good speed, 1 pt make",
        "balls": 15
      }
    ],
    "levels": [
      {
        "name": "6 of 15",
        "rule": "6 of 15 points"
      },
      {
        "name": "8 of 15",
        "rule": "8 of 15 points"
      },
      {
        "name": "10 of 15",
        "rule": "10 of 15 points"
      }
    ],
    "cue": "Roll each ball through the gate and on to the hole at holing speed.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/instruction/putting/jordan-spieth-reveals-practice-putting-routine/",
    "status": "active"
  },
  {
    "name": "Two-Hole Zone",
    "category": "putting",
    "practice_category": "lag_putting",
    "locations": [
      "putting_green"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 6,
    "time_estimate_mins": 15,
    "description": "Three in a row inside the zone, at 10 feet then at 40.",
    "target_area": "lag",
    "instructions": "Cut two holes 40 feet apart and lay a club 3 feet past each. Putt between them until 3 balls in a row finish between the hole and the club from 10 feet, then do the same from 40 feet. Log the putts it took for each distance.",
    "equipment_needed": "putter, balls, 2 clubs",
    "equipment": "putter, balls, 2 clubs",
    "structure": "blocked",
    "pressure": 2,
    "metric": "strokes",
    "lower_is_better": true,
    "sets": [
      {
        "label": "10 ft zone",
        "setup": "Putts until 3 in a row finish in the zone; a miss restarts",
        "balls": 3
      },
      {
        "label": "40 ft zone",
        "setup": "Putts until 3 in a row finish in the zone; a miss restarts",
        "balls": 3
      }
    ],
    "levels": [
      {
        "name": "15 putts",
        "rule": "Both distances in 15 putts or fewer"
      },
      {
        "name": "10 putts",
        "rule": "Both distances in 10 putts or fewer"
      },
      {
        "name": "6 putts",
        "rule": "Both distances in 6 putts, no misses"
      }
    ],
    "cue": "Stop the ball between the hole and the club.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://www.todaysgolfer.co.uk/news-and-events/tour-news/2015/january/secrets-in-the-dirt/",
    "status": "active"
  },
  {
    "name": "Eyes-Closed Coin",
    "category": "putting",
    "practice_category": "lag_putting",
    "locations": [
      "putting_green",
      "home_net"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 10,
    "time_estimate_mins": 10,
    "description": "Putt to a coin with your eyes closed, then check the distance.",
    "target_area": "lag",
    "instructions": "Toss a coin 10 to 40 feet away, or place it at the far end of the rug. Look at the coin, close your eyes and putt. Count the balls that finish within 2 feet of it.",
    "equipment_needed": "putter, balls, coin",
    "equipment": "putter, balls, coin",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Eyes closed",
        "setup": "10 putts to a coin at a new spot each time; count those within 2 ft",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "4 of 10",
        "rule": "4 of 10 within 2 ft"
      },
      {
        "name": "6 of 10",
        "rule": "6 of 10 within 2 ft"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 within 2 ft"
      }
    ],
    "cue": "Roll each ball to stop at the coin.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://www.golfdigest.com/story/Scottie-scheffler-chapstick-putting-drill-2024-speed-control",
    "status": "active"
  },
  {
    "name": "Three-Disc Line",
    "category": "putting",
    "practice_category": "lag_putting",
    "locations": [
      "putting_green"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 10,
    "time_estimate_mins": 15,
    "description": "Three discs on a 20-foot line: roll over or just inside all three.",
    "target_area": "lag",
    "instructions": "Lay a 20-foot line and set 3 discs on its last two-thirds. Putt 10 balls from the start of the line. Count the balls that roll over or just inside all three discs.",
    "equipment_needed": "putter, balls, 3 discs or coins, tape",
    "equipment": "putter, balls, 3 discs or coins, tape",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Disc line",
        "setup": "10 putts at 20 ft; count the balls that pass over or just inside all 3 discs",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "4 of 10",
        "rule": "4 of 10 pass all three discs"
      },
      {
        "name": "6 of 10",
        "rule": "6 of 10 pass all three discs"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 pass all three discs"
      }
    ],
    "cue": "Roll each ball along the line over every disc.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/?p=15543981",
    "status": "active"
  },
  {
    "name": "Nicklaus 15-20-30",
    "category": "putting",
    "practice_category": "lag_putting",
    "locations": [
      "putting_green"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 15,
    "time_estimate_mins": 15,
    "description": "Five long putts each from 15, 20 and 30 feet.",
    "target_area": "lag",
    "instructions": "Putt 5 balls from 15 feet, 5 from 20 feet and 5 from 30 feet to the same hole or to different holes. Count the balls that finish within 3 feet of the hole.",
    "equipment_needed": "putter, balls, tees",
    "equipment": "putter, balls, tees",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "15 ft",
        "setup": "5 putts; count those finishing within 3 ft",
        "balls": 5
      },
      {
        "label": "20 ft",
        "setup": "5 putts; count those finishing within 3 ft",
        "balls": 5
      },
      {
        "label": "30 ft",
        "setup": "5 putts; count those finishing within 3 ft",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "9 of 15",
        "rule": "9 of 15 within 3 ft"
      },
      {
        "name": "12 of 15",
        "rule": "12 of 15 within 3 ft"
      },
      {
        "name": "14 of 15",
        "rule": "14 of 15 within 3 ft"
      }
    ],
    "cue": "Roll each ball to stop within three feet of the hole.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://www.pga.com/story/lag-putting-sink-putts-like-the-golden-bear",
    "status": "active"
  },
  {
    "name": "Pelz Long Lag Circle",
    "category": "putting",
    "practice_category": "lag_putting",
    "locations": [
      "putting_green"
    ],
    "difficulty": "advanced",
    "reps_suggested": 10,
    "time_estimate_mins": 15,
    "description": "Ten putts of 35 to 60 feet to finish inside a 6-foot circle.",
    "target_area": "lag",
    "instructions": "Mark a 6-foot circle around a hole with string or tees. Putt 10 balls from different spots between 35 and 60 feet. Count the balls that finish inside the circle.",
    "equipment_needed": "putter, balls, string or tees",
    "equipment": "putter, balls, string or tees",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Long lags",
        "setup": "10 putts at 35-60 ft; count those finishing inside the 6 ft circle",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "5 of 10",
        "rule": "5 of 10 inside the circle"
      },
      {
        "name": "7 of 10",
        "rule": "7 of 10 inside the circle"
      },
      {
        "name": "9 of 10",
        "rule": "9 of 10 inside the circle"
      }
    ],
    "cue": "Roll each ball to stop inside the circle.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/instruction/10-brilliant-short-game-tips-dave-pelz-timeless-tips/",
    "status": "active"
  },
  {
    "name": "Par 18",
    "category": "short_game",
    "practice_category": "short_game",
    "locations": [
      "short_game_area"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 9,
    "time_estimate_mins": 25,
    "description": "Nine spots, one ball each, chip and putt out against par 2.",
    "target_area": "scrambling",
    "instructions": "Pick 9 spots around the green from easy to hard. Play one ball from each, chip and putt until it is holed, with par 2 for every spot. Log your total strokes against a par of 18.",
    "equipment_needed": "wedge, putter, balls",
    "equipment": "wedge, putter, balls",
    "structure": "random",
    "pressure": 1,
    "metric": "strokes",
    "lower_is_better": true,
    "sets": [
      {
        "label": "Nine spots",
        "setup": "One ball per spot, chip and putt out; par is 2 each",
        "balls": 9
      }
    ],
    "levels": [
      {
        "name": "22 strokes",
        "rule": "22 strokes or fewer"
      },
      {
        "name": "20 strokes",
        "rule": "20 strokes or fewer"
      },
      {
        "name": "18 strokes",
        "rule": "18 strokes or fewer, level par"
      }
    ],
    "cue": "Pick a landing spot and let the ball release to the hole.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://golfdigestme.com/?p=28221",
    "status": "active"
  },
  {
    "name": "Westwood Five in Ten",
    "category": "short_game",
    "practice_category": "short_game",
    "locations": [
      "short_game_area"
    ],
    "difficulty": "advanced",
    "reps_suggested": 5,
    "time_estimate_mins": 25,
    "description": "Rounds of five chips until they finish a combined 10 feet from the hole.",
    "target_area": "chipping",
    "instructions": "Chip 5 balls from varied lies to one flag. Add up how far from the hole each one finished. If the total is 10 feet or less you are done; if not, play another round of 5. Log the number of rounds.",
    "equipment_needed": "wedge, balls, flag",
    "equipment": "wedge, balls, flag",
    "structure": "random",
    "pressure": 1,
    "metric": "strokes",
    "lower_is_better": true,
    "sets": [
      {
        "label": "Rounds of five",
        "setup": "5 chips from varied lies; done when the five total 10 ft or less",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "6 rounds",
        "rule": "Finish in 6 rounds or fewer"
      },
      {
        "name": "4 rounds",
        "rule": "Finish in 4 rounds or fewer"
      },
      {
        "name": "2 rounds",
        "rule": "Finish in 2 rounds or fewer"
      }
    ],
    "cue": "Land each chip so it rolls out next to the flag.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.todaysgolfer.co.uk/news-and-events/tour-news/2015/january/secrets-in-the-dirt/",
    "status": "active"
  },
  {
    "name": "Seve Two-Loft Chips",
    "category": "short_game",
    "practice_category": "short_game",
    "locations": [
      "short_game_area"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 10,
    "time_estimate_mins": 20,
    "description": "The same hole with a high chip, then a low one.",
    "target_area": "chipping",
    "instructions": "Pick one hole and a landing spot just over the fringe. Hit 5 high chips with a sand wedge, then 5 low chips with a nine-iron. Count the chips that finish within 4 feet of the hole.",
    "equipment_needed": "sand wedge, nine-iron, balls",
    "equipment": "sand wedge, nine-iron, balls",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Sand wedge, high",
        "setup": "5 chips landing just over the fringe; count those within 4 ft",
        "balls": 5
      },
      {
        "label": "Nine-iron, low",
        "setup": "5 chips landing just over the fringe; count those within 4 ft",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "4 of 10",
        "rule": "4 of 10 within 4 ft"
      },
      {
        "name": "6 of 10",
        "rule": "6 of 10 within 4 ft"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 within 4 ft"
      }
    ],
    "cue": "Land the ball just over the fringe and let it roll to the hole.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.golf365.com/news/seve-ballesteros-chipping-drill-success-secrets",
    "status": "active"
  },
  {
    "name": "Mickelson Chip Match",
    "category": "short_game",
    "practice_category": "short_game",
    "locations": [
      "short_game_area"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 9,
    "time_estimate_mins": 25,
    "description": "Nine holes against a partner: the closer chip wins the hole.",
    "target_area": "chipping",
    "instructions": "Play 9 chips against a partner from a different lie each time. The chip that finishes closer wins the hole, and a holed chip wins it outright. Log the holes you won out of 9.",
    "equipment_needed": "wedge, balls, partner",
    "equipment": "wedge, balls, partner",
    "structure": "random",
    "pressure": 2,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Nine holes",
        "setup": "9 chips against a partner; count the holes you win",
        "balls": 9
      }
    ],
    "levels": [
      {
        "name": "5 of 9",
        "rule": "Win 5 of 9 holes"
      },
      {
        "name": "6 of 9",
        "rule": "Win 6 of 9 holes"
      },
      {
        "name": "7 of 9",
        "rule": "Win 7 of 9 holes"
      }
    ],
    "cue": "Land the ball so it finishes closer to the hole than your partner's.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://golf.com/instruction/short-game/phil-mickelson-chipping-game/",
    "status": "active"
  },
  {
    "name": "Pelz Two-Line Bunker",
    "category": "short_game",
    "practice_category": "short_game",
    "locations": [
      "short_game_area"
    ],
    "difficulty": "advanced",
    "reps_suggested": 10,
    "time_estimate_mins": 20,
    "description": "Splash shots entering the sand on a line, then ten balls for score.",
    "target_area": "bunker",
    "instructions": "Draw two lines in the sand 5 inches apart and take 10 rehearsal swings entering the sand on the back line. Then hit 10 balls from the same spot. Count the balls that come out and finish on the green.",
    "equipment_needed": "sand wedge, balls, rake, practice bunker",
    "equipment": "sand wedge, balls, rake, practice bunker",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Ten bunker shots",
        "setup": "10 balls after the rehearsal swings; count those out and on the green",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "6 of 10",
        "rule": "6 of 10 out and on the green"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 out and on the green"
      },
      {
        "name": "10 of 10",
        "rule": "10 of 10 out and on the green"
      }
    ],
    "cue": "Splash the ball out and onto the green.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://golf.com/instruction/10-brilliant-short-game-tips-dave-pelz-timeless-tips/",
    "status": "active"
  },
  {
    "name": "Donald 30-Ball Ladder",
    "category": "approach",
    "practice_category": "wedges",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "advanced",
    "reps_suggested": 30,
    "time_estimate_mins": 30,
    "description": "Three balls at each of ten distances from 75 to 102 yards.",
    "target_area": "wedge distances",
    "instructions": "Hit 3 balls at each of 75, 78, 81, 84, 87, 90, 93, 96, 99 and 102 yards, one distance at a time. Count the balls that finish inside 15 feet of the target. Log each group of distances as a set.",
    "equipment_needed": "wedges, 30 balls, yardage targets or launch monitor",
    "equipment": "wedges, 30 balls, yardage targets or launch monitor",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "75-84 yd",
        "setup": "3 balls at each of 75, 78, 81 and 84 yd; count those within 15 ft",
        "balls": 12
      },
      {
        "label": "87-96 yd",
        "setup": "3 balls at each of 87, 90, 93 and 96 yd; count those within 15 ft",
        "balls": 12
      },
      {
        "label": "99-102 yd",
        "setup": "3 balls at each of 99 and 102 yd; count those within 15 ft",
        "balls": 6
      }
    ],
    "levels": [
      {
        "name": "12 of 30",
        "rule": "12 of 30 within 15 ft"
      },
      {
        "name": "17 of 30",
        "rule": "17 of 30 within 15 ft"
      },
      {
        "name": "22 of 30",
        "rule": "22 of 30 within 15 ft"
      }
    ],
    "cue": "Land each ball on the number for that distance.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.golfdigest.com/story/luke-donald-30-ball-wedge-game-golf-digest-improve",
    "status": "active"
  },
  {
    "name": "Mickelson Carry Window",
    "category": "approach",
    "practice_category": "wedges",
    "locations": [
      "range",
      "simulator",
      "home_net"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 30,
    "time_estimate_mins": 25,
    "description": "Ten balls at each of three carry numbers, scored by carry.",
    "target_area": "wedge distances",
    "instructions": "Pick three carry numbers, for example 50, 70 and 90 yards. Hit 10 balls to each one and read the carry from a launch monitor. Count the balls that carry within 3 yards of the number.",
    "equipment_needed": "wedges, 30 balls, launch monitor",
    "equipment": "wedges, 30 balls, launch monitor",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Carry number 1",
        "setup": "10 balls; count the carries within 3 yd",
        "balls": 10
      },
      {
        "label": "Carry number 2",
        "setup": "10 balls; count the carries within 3 yd",
        "balls": 10
      },
      {
        "label": "Carry number 3",
        "setup": "10 balls; count the carries within 3 yd",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "12 of 30",
        "rule": "12 of 30 within 3 yd"
      },
      {
        "name": "18 of 30",
        "rule": "18 of 30 within 3 yd"
      },
      {
        "name": "24 of 30",
        "rule": "24 of 30 within 3 yd"
      }
    ],
    "cue": "Carry each ball to the number.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.todaysgolfer.co.uk/news-and-events/tour-news/2015/january/secrets-in-the-dirt/",
    "status": "active"
  },
  {
    "name": "Pelz Clock",
    "category": "approach",
    "practice_category": "wedges",
    "locations": [
      "range",
      "simulator",
      "home_net"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 15,
    "time_estimate_mins": 20,
    "description": "One wedge at three swing lengths, scored for a repeatable carry.",
    "target_area": "wedge distances",
    "instructions": "Use one wedge and hit 5 balls each with a 7:30, a 9:00 and a 10:30 swing length. Note the average carry of each group. Count the balls that carry within 4 yards of their group's average.",
    "equipment_needed": "one wedge, balls, launch monitor or yardage targets",
    "equipment": "one wedge, balls, launch monitor or yardage targets",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "7:30 swing",
        "setup": "5 balls; count carries within 4 yd of the average",
        "balls": 5
      },
      {
        "label": "9:00 swing",
        "setup": "5 balls; count carries within 4 yd of the average",
        "balls": 5
      },
      {
        "label": "10:30 swing",
        "setup": "5 balls; count carries within 4 yd of the average",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "8 of 15",
        "rule": "8 of 15 within 4 yd of the average"
      },
      {
        "name": "11 of 15",
        "rule": "11 of 15 within 4 yd of the average"
      },
      {
        "name": "13 of 15",
        "rule": "13 of 15 within 4 yd of the average"
      }
    ],
    "cue": "Carry every ball to the same spot for that swing length.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://golf.com/instruction/10-brilliant-short-game-tips-dave-pelz-timeless-tips/",
    "status": "active"
  },
  {
    "name": "Scott Bag Ladder",
    "category": "approach",
    "practice_category": "warmup",
    "locations": [
      "range"
    ],
    "difficulty": "beginner",
    "reps_suggested": 50,
    "time_estimate_mins": 25,
    "description": "Five targets from 75 to 210 yards, ten balls each.",
    "target_area": "warm-up",
    "instructions": "Hit 10 balls at each of five targets: 75, 100, 150, 175 and 210 yards, with a suitable club for each. Count the balls that finish on target. Finish with a few 3-wood and driver shots that are not scored.",
    "equipment_needed": "full bag, 50 balls, range targets",
    "equipment": "full bag, 50 balls, range targets",
    "structure": "blocked",
    "pressure": 0,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "75 yd",
        "setup": "10 balls; count those on target",
        "balls": 10
      },
      {
        "label": "100 yd",
        "setup": "10 balls; count those on target",
        "balls": 10
      },
      {
        "label": "150 yd",
        "setup": "10 balls; count those on target",
        "balls": 10
      },
      {
        "label": "175 yd",
        "setup": "10 balls; count those on target",
        "balls": 10
      },
      {
        "label": "210 yd",
        "setup": "10 balls; count those on target",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "25 of 50",
        "rule": "25 of 50 on target"
      },
      {
        "name": "33 of 50",
        "rule": "33 of 50 on target"
      },
      {
        "name": "40 of 50",
        "rule": "40 of 50 on target"
      }
    ],
    "cue": "Send each ball at the target for its distance.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.todaysgolfer.co.uk/news-and-events/tour-news/2015/january/secrets-in-the-dirt/",
    "status": "active"
  },
  {
    "name": "Nine Windows",
    "category": "approach",
    "practice_category": "approach",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "advanced",
    "reps_suggested": 9,
    "time_estimate_mins": 25,
    "description": "Nine shots: low, mid and high, each as a draw, straight and fade.",
    "target_area": "shot shape",
    "instructions": "Pick a target and call each of nine shots before you hit it: low, mid and high flights, each as a draw, a straight shot and a fade. Count the shots that match the call.",
    "equipment_needed": "iron, balls, range target",
    "equipment": "iron, balls, range target",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Nine windows",
        "setup": "9 shots, calling each flight and shape first; count the matches",
        "balls": 9
      }
    ],
    "levels": [
      {
        "name": "4 of 9",
        "rule": "4 of 9 match the call"
      },
      {
        "name": "6 of 9",
        "rule": "6 of 9 match the call"
      },
      {
        "name": "8 of 9",
        "rule": "8 of 9 match the call"
      }
    ],
    "cue": "Start the ball on the line and give it the flight you called.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.golfwrx.com/664080/tiger-woods-breaks-down-his-famous-nine-window-warm-up-drill/",
    "status": "active"
  },
  {
    "name": "Stinger and Ladder",
    "category": "approach",
    "practice_category": "approach",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "advanced",
    "reps_suggested": 5,
    "time_estimate_mins": 20,
    "description": "Pairs of shots with one club: one low, one high, to the same target.",
    "target_area": "trajectory",
    "instructions": "Pick a club and a target. Hit a low shot, then a high shot, to the same target as a pair, and play 5 pairs. Count the pairs where both flights are right.",
    "equipment_needed": "iron, balls, range target",
    "equipment": "iron, balls, range target",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Five pairs",
        "setup": "5 pairs of one low and one high shot; count the pairs with both flights right",
        "balls": 5
      }
    ],
    "levels": [
      {
        "name": "2 of 5",
        "rule": "2 of 5 pairs right"
      },
      {
        "name": "3 of 5",
        "rule": "3 of 5 pairs right"
      },
      {
        "name": "4 of 5",
        "rule": "4 of 5 pairs right"
      }
    ],
    "cue": "Land both shots at the target, one low and one high.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.nationalclubgolfer.com/golf-tips/iron-play/tiger-woods-range-drill/",
    "status": "active"
  },
  {
    "name": "Scenario Shots",
    "category": "approach",
    "practice_category": "approach",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 10,
    "time_estimate_mins": 20,
    "description": "Ten imagined on-course situations, never the same shot twice.",
    "target_area": "shot making",
    "instructions": "Imagine 10 different situations: over a bunker to a tight pin, under a branch, a high shot over a tree. Never repeat a shot. Count the shots that did the job you pictured.",
    "equipment_needed": "full bag, balls, range targets",
    "equipment": "full bag, balls, range targets",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Ten scenarios",
        "setup": "10 different imagined shots; count those that did the job",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "5 of 10",
        "rule": "5 of 10 did the job"
      },
      {
        "name": "7 of 10",
        "rule": "7 of 10 did the job"
      },
      {
        "name": "9 of 10",
        "rule": "9 of 10 did the job"
      }
    ],
    "cue": "Send each ball where the situation needs it to go.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.golfdigest.com/story/scottie-scheffler-practice-session-what-you-can-learn",
    "status": "active"
  },
  {
    "name": "Range Round",
    "category": "approach",
    "practice_category": "approach",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "advanced",
    "reps_suggested": 32,
    "time_estimate_mins": 35,
    "description": "A full 18 played on the range: tee shot, then approach.",
    "target_area": "course play",
    "instructions": "Play 18 holes in your head: a tee shot, then an approach, with no mulligans and never the same club twice in a row. Count the fairways you hit with tee shots (14) and the greens you hit with approaches (18).",
    "equipment_needed": "full bag, balls, range targets",
    "equipment": "full bag, balls, range targets",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Tee shots",
        "setup": "14 tee shots; count the fairways hit",
        "balls": 14
      },
      {
        "label": "Approaches",
        "setup": "18 approaches; count the greens hit",
        "balls": 18
      }
    ],
    "levels": [
      {
        "name": "16 of 32",
        "rule": "16 of 32 fairways and greens hit"
      },
      {
        "name": "20 of 32",
        "rule": "20 of 32 fairways and greens hit"
      },
      {
        "name": "24 of 32",
        "rule": "24 of 32 fairways and greens hit"
      }
    ],
    "cue": "Hit each ball to the fairway or green you picked.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://golf.com/instruction/collin-morikawa-practices-range/",
    "status": "active"
  },
  {
    "name": "Six-Iron Window",
    "category": "approach",
    "practice_category": "approach",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 10,
    "time_estimate_mins": 15,
    "description": "Ten balls at a green-sized target 175 to 200 yards away.",
    "target_area": "approach",
    "instructions": "Set a green-sized target 175 to 200 yards away and use the club that flies that far, a six-iron if it does. Hit 10 balls at it. Count the balls that finish on the target.",
    "equipment_needed": "iron, 10 balls, range target",
    "equipment": "iron, 10 balls, range target",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Ten balls",
        "setup": "10 balls at a green-sized target 175-200 yd; count those on target",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "4 of 10",
        "rule": "4 of 10 on target"
      },
      {
        "name": "6 of 10",
        "rule": "6 of 10 on target"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 on target"
      }
    ],
    "cue": "Land each ball on the target.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.todaysgolfer.co.uk/news-and-events/tour-news/2015/january/secrets-in-the-dirt/",
    "status": "active"
  },
  {
    "name": "Stinger Fairway",
    "category": "off_tee",
    "practice_category": "tee",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "advanced",
    "reps_suggested": 10,
    "time_estimate_mins": 15,
    "description": "Ten low tee shots into a 30-yard corridor.",
    "target_area": "fairways",
    "instructions": "Mark a corridor 30 yards wide. Hit 10 low tee shots with a club you can keep in play. Count the balls that finish inside the corridor.",
    "equipment_needed": "driver or long iron, balls, range",
    "equipment": "driver or long iron, balls, range",
    "structure": "blocked",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Low tee shots",
        "setup": "10 low tee shots into a 30 yd corridor; count those inside",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "5 of 10",
        "rule": "5 of 10 inside the corridor"
      },
      {
        "name": "7 of 10",
        "rule": "7 of 10 inside the corridor"
      },
      {
        "name": "9 of 10",
        "rule": "9 of 10 inside the corridor"
      }
    ],
    "cue": "Keep the ball low and finish it in the middle of the corridor.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://golf.com/instruction/driving/tiger-woods-patented-stinger-timeless-tips/",
    "status": "active"
  },
  {
    "name": "Called Driver Shapes",
    "category": "off_tee",
    "practice_category": "tee",
    "locations": [
      "range",
      "simulator"
    ],
    "difficulty": "advanced",
    "reps_suggested": 10,
    "time_estimate_mins": 20,
    "description": "Alternate a called fade and a called draw into a 35-yard corridor.",
    "target_area": "shot shape",
    "instructions": "Mark a corridor 35 yards wide. Hit 10 drivers, calling a fade or a draw before each one and alternating. Count the balls that make the shape you called and finish inside the corridor.",
    "equipment_needed": "driver, balls, range",
    "equipment": "driver, balls, range",
    "structure": "random",
    "pressure": 1,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Ten drivers",
        "setup": "10 drivers alternating a called fade and draw; count the right shape inside 35 yd",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "4 of 10",
        "rule": "4 of 10 right shape and inside"
      },
      {
        "name": "6 of 10",
        "rule": "6 of 10 right shape and inside"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 right shape and inside"
      }
    ],
    "cue": "Shape the ball the way you called it and land it in the corridor.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://www.golfdigest.com/story/scottie-scheffler-practice-session-what-you-can-learn",
    "status": "active"
  },
  {
    "name": "Scheffler Warm-Up Lags",
    "category": "putting",
    "practice_category": "warmup",
    "locations": [
      "putting_green"
    ],
    "difficulty": "beginner",
    "reps_suggested": 10,
    "time_estimate_mins": 10,
    "description": "Two balls to each of five holes at different lengths.",
    "target_area": "lag",
    "instructions": "Pick 5 holes at different lengths and putt 2 balls to each. Count the balls that finish within 3 feet of the hole.",
    "equipment_needed": "putter, 10 balls",
    "equipment": "putter, 10 balls",
    "structure": "random",
    "pressure": 0,
    "metric": "count_of_n",
    "lower_is_better": false,
    "sets": [
      {
        "label": "Five holes",
        "setup": "2 balls to each of 5 holes at varied lengths; count those within 3 ft",
        "balls": 10
      }
    ],
    "levels": [
      {
        "name": "6 of 10",
        "rule": "6 of 10 within 3 ft"
      },
      {
        "name": "8 of 10",
        "rule": "8 of 10 within 3 ft"
      },
      {
        "name": "10 of 10",
        "rule": "10 of 10 within 3 ft"
      }
    ],
    "cue": "Roll each ball to stop within three feet of the hole.",
    "routine_rule": "Full routine on every putt.",
    "source_url": "https://golf.com/instruction/how-scottie-scheffler-warms-up/",
    "status": "active"
  },
  {
    "name": "Hole the Hard One",
    "category": "short_game",
    "practice_category": "closeout",
    "locations": [
      "short_game_area"
    ],
    "difficulty": "intermediate",
    "reps_suggested": 1,
    "time_estimate_mins": 5,
    "description": "Chip the hardest shot around the green until one goes in.",
    "target_area": "chipping",
    "instructions": "Pick the hardest chip you can find around the green. Keep hitting it from the same spot until you hole one. Log the number of attempts it took.",
    "equipment_needed": "wedge, balls",
    "equipment": "wedge, balls",
    "structure": "blocked",
    "pressure": 2,
    "metric": "strokes",
    "lower_is_better": true,
    "sets": [
      {
        "label": "The hard chip",
        "setup": "Attempts until one is holed",
        "balls": 1
      }
    ],
    "levels": [
      {
        "name": "10 attempts",
        "rule": "Holed in 10 attempts or fewer"
      },
      {
        "name": "6 attempts",
        "rule": "Holed in 6 attempts or fewer"
      },
      {
        "name": "3 attempts",
        "rule": "Holed in 3 attempts or fewer"
      }
    ],
    "cue": "Pick the landing spot and let the ball roll into the hole.",
    "routine_rule": "Full routine on every ball.",
    "source_url": "https://golf.com/instruction/how-scottie-scheffler-warms-up/",
    "status": "active"
  }
]
$seed$::jsonb) as s(name text, category text, description text, target_area text, difficulty text, reps_suggested integer, time_estimate_mins integer, instructions text, equipment_needed text, practice_category text, locations text[], equipment text, structure text, pressure smallint, metric text, lower_is_better boolean, sets jsonb, levels jsonb, cue text, routine_rule text, source_url text, status text)
on conflict (name) do nothing;
