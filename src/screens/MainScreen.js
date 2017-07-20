(function (Core) {

	"use strict";

	var MainScreen = Core.Screen.extend({

		speed:  2,
		bird: null,
		pipes: null,

		score: 0,
		state: null,

		bg: 0,
		bgOffset: 0,

		sounds: {
			"point": new Core.Sound("res/audio/sfx_point", 1),
			"hit": new Core.Sound("res/audio/sfx_hit", 1)
		},

		shake: null,
		flash: null,


		
		m_state: {"bin_vertical_distance": 0, "bin_horizontal_distance": 0},
		m_state_dash: {"vertical_distance": 0, "horizontal_distance": 0},
		explore: 0.00,
		action_to_perform: "do_nothing",
		vscale: 18,
		hscale: 15,
		alpha_QL: 0.7,
		vertical_dist_range: [-85, 15],
		horizontal_dist_range: [0, 60],
		trainTimes: 0,
		startTime: 0,
		duration: 0,
		maxScore: 0,
		debugColor: 0x000079,
		debugColorStr: '#000079',

		min_diff: 9999, 
		max_diff: -9999, 

		init: function () {
			this.reset();

			// Vertical Distance
			this.Q = new Array();
			for (var vert_dist = 0; vert_dist < (this.vertical_dist_range[1] - this.vertical_dist_range[0])/this.vscale; vert_dist++) {
				this.Q[vert_dist] = new Array();

				// Horizontal Distance
				for (var hori_dist = 0; hori_dist < (this.horizontal_dist_range[1] - this.horizontal_dist_range[0])/this.hscale; hori_dist++) {
					this.Q[vert_dist][hori_dist] = {"click": 0, "do_nothing": 0};
				}
			}
			this.printState();
			this.startTime = Date.parse(new Date());
		},


		reset: function () {
			this.score = 0;
			var offset = Core.env.w * 1;
			this.state = new Core.utils.State("BORN");
			this.bird = new window.Bird(Core.env.w * 0.24, Core.env.h * 0.46, this);
			this.bg = Core.utils.rand(2);
			this.bird.setColor(Core.utils.rand(3));
			this.pipes = [
				new window.Pipe(0, "up", offset + Core.env.w, Core.env.h - 170, this.speed),
				new window.Pipe(0, "down", offset + Core.env.w, - 100, this.speed),

				new window.Pipe(1, "up", offset + (Core.env.w * 1.6), Core.env.h - 170, this.speed),
				new window.Pipe(1, "down", offset + (Core.env.w * 1.6), - 100, this.speed),

				new window.Pipe(2, "up", offset + (Core.env.w * 2.2), Core.env.h - 170, this.speed),
				new window.Pipe(2, "down", offset + (Core.env.w * 2.2), - 100, this.speed)
			];

			this.setHeight(0);
			this.setHeight(1);
			this.setHeight(2);
		},


		tick: function () {
			this.state.tick();
			this.bird.tick();

			var valid = false;
			var reward = 0;
			this.updateDuration();
			this.updateMaxScore();
			
			switch (this.state.get()) {
				case "BORN":
					this.state.set("RUNNING");
					this.bird.state.set("CRUSING");
					break;


				case "RUNNING":
					if (this.state.first()) {
						this.bird.state.set("RUNNING");
					}
					this.tick_RUNNING();

					// Step 2: Observe Reward R
					valid = true;
					reward = 1;

					break;


				case "DYING":
					this.state.set("GAMEOVER");

					// Step 2: Observe Reward R
					valid = true;
					reward = -1000;
					break;


				case "GAMEOVER":
					if (this.state.first()) {
						if (this.score > window.game.best) {
							window.game.best = this.score;
						}
					}

					this.sounds.hit.play();
					this.updateTrainTimes();
					this.updateDebugColor();
					
					this.reset();
					this.state.set("BORN");
					break;
			}

			if (valid) {

				// Step 2: Observe State S'
				var horizontal_distance = 9999;
				var vertical_distance = 9999;

				for (var i = 0; i < 6; i++) {
					if (this.pipes[i].dir == "up" && this.pipes[i].x + this.pipes[i].w >= this.bird.x) {
						var diff = (this.pipes[i].x + this.pipes[i].w - this.bird.x);
						if (horizontal_distance > diff) {
							horizontal_distance = diff;
							vertical_distance = (this.bird.y - this.pipes[i].y);
						}
					}
				}
				
				this.m_state_dash.vertical_distance = vertical_distance;
				this.m_state_dash.horizontal_distance = horizontal_distance;
				
				
				var state_bin_v = this.m_state.bin_vertical_distance;
				var state_bin_h = this.m_state.bin_horizontal_distance;
				// Step 3: Update Q(S, A)

				var state_current_bin_v = 
				Math.max( 
					Math.min ( 
						Math.floor((this.vertical_dist_range[1]-this.vertical_dist_range[0]-1)/this.vscale), 
						Math.floor( (this.m_state_dash.vertical_distance - this.vertical_dist_range[0])/this.vscale )
					), 
					0
				);
				
				var state_current_bin_h = 
				Math.max( 
					Math.min ( 
						Math.floor((this.horizontal_dist_range[1]-this.horizontal_dist_range[0]-1)/this.hscale), 
						Math.floor( (this.m_state_dash.horizontal_distance - this.horizontal_dist_range[0])/this.hscale )
					), 
					0
				);

				this.showState(state_current_bin_v, state_current_bin_h);
				
				var click_v = this.Q[state_current_bin_v][state_current_bin_h]["click"];
				var do_nothing_v = this.Q[state_current_bin_v][state_current_bin_h]["do_nothing"]
				var expect_reward = Math.max(click_v, do_nothing_v);

				var Q_s_a = this.Q[state_bin_v][state_bin_h][this.action_to_perform];
				this.Q[state_bin_v][state_bin_h][this.action_to_perform] = 
					Q_s_a + this.alpha_QL * (reward + expect_reward - Q_s_a);

				// Step 4: S <- S'
				this.m_state.bin_vertical_distance = state_current_bin_v;
				this.m_state.bin_horizontal_distance = state_current_bin_h;

				// Step 1: Select and perform Action A
				if (Math.random() < this.explore) {
					this.action_to_perform = Core.utils.rand(2) == 0 ? "click" : "do_nothing";
				}
				else {
					var click_v = this.Q[state_current_bin_v][state_current_bin_h]["click"];
					var do_nothing_v = this.Q[state_current_bin_v][state_current_bin_h]["do_nothing"]
					this.action_to_perform = click_v > do_nothing_v ? "click" : "do_nothing";
				}

				if (this.action_to_perform == "click") {
					this.bird.performJump();
				}

			}



			if (this.shake && !this.shake.tick()) {
				this.shake = null;
			}
			if (this.flash && !this.flash.tick()) {
				this.flash = null;
			}

		},


		printState: function () {
			$("#debug").text("");
			var debugStr = "";
			debugStr += "<table style='float: left;'><tr><th>items</th><th>values</th></tr>";
			debugStr += "<tr><td>max score</td><td id='max_score''>0</td></tr>";
			debugStr += "<tr><td>duration</td><td id='duration'>0</td></tr>";
			debugStr += "<tr><td>train times</td><td id='train_times'>0</td></tr>";
			debugStr += "<tr><td>frame rate</td><td ><input type='text' id='frame_rate'/></td></tr>";
			debugStr += "</table>";
			debugStr += "<table><tr><th>idx</th>";
			
			var vertical_dist_range = Math.floor((this.vertical_dist_range[1]-this.vertical_dist_range[0]-1)/this.vscale);
			var horizontal_dist_range = Math.floor((this.horizontal_dist_range[1]-this.horizontal_dist_range[0]-1)/this.hscale);
			
			for (var hori_dist = 0; hori_dist < horizontal_dist_range; ++ hori_dist){
				debugStr += ("<th>" + hori_dist + "</th>");
			}
			debugStr += "</tr>" ;
			for (var vert_dist = 0; vert_dist < vertical_dist_range; vert_dist++) {
				debugStr += "<tr><td>" + vert_dist + '</td>';
				for (var hori_dist = 0; hori_dist < horizontal_dist_range; ++hori_dist) {
					debugStr += "<td id='"+vert_dist+"_"+hori_dist+"'>" + '-' + "</td>";
				}
				debugStr += "</tr>";
			}
			debugStr += "</table>";
			$("#debug").append(debugStr);
		},

		updateDuration: function(){
			var duration = (Date.parse(new Date()) - this.startTime)/1000
			$('#duration').text(duration + "s");
		},
		
		updateTrainTimes: function(){
			this.trainTimes = this.trainTimes + 1;
			$('#train_times').text(this.trainTimes);
		},
		
		updateMaxScore: function(){
			if(this.maxScore < this.score){
				this.maxScore = this.score;
				$('#max_score').text(this.maxScore);	
			}
		},
		
		showState: function(vert_dist, hori_dist){
			var debug_char = this.Q[vert_dist][hori_dist]["click"] > this.Q[vert_dist][hori_dist]["do_nothing"] ? 'c' : 'n';
			$("#"+vert_dist+"_"+hori_dist).text(debug_char);
			$("#"+vert_dist+"_"+hori_dist).css('background-color',this.debugColorStr);
		},
		
		updateDebugColor: function(){
			this.debugColor = (this.debugColor + 84) & 0xffffff;
			this.debugColorStr = '#' + this.debugColor .toString(16);
		},
		
		tick_RUNNING: function () {

			this.moveLand();

			this.pipes = this.pipes.filter(function (p) {
				p.tick();
				if (!p.counted && p.x < this.bird.x) {
					p.counted = true;
					this.score += 0.5;
					this.sounds.point.play();
				}

				if (p.reset) {
					this.setHeight(p.group);
				}
				return true;
			}, this);

			Core.Physics.checkCollision(this.bird, this.pipes);
		},

		moveLand: function () {
			this.bgOffset -= this.speed;
			if (this.bgOffset < -Core.env.w) {
				this.bgOffset += Core.env.w;
			}
		},

		setHeight: function (group) {
			var h = (Math.random() * 160 | 0) + 130;
			this.pipes.filter(function (p) {
				return p.group === group;
			}).forEach(function (p) {
				p.y = p.dir == "up" ? h + 65 : h - p.h - 65;
			});
		},

		render: function (gfx) {
			var atlas = window.game.atlas;

			gfx.ctx.save();

			this.shake && this.shake.render(gfx);

			this.renderBG(gfx, atlas);

			this.renderGame(gfx, atlas);

			switch (this.state.get()) {
				case "GETREADY":
					this.renderGetReady(gfx, atlas);
					this.renderFG(gfx, atlas);
					break;
				case "GAMEOVER":
					this.renderFG(gfx, atlas);
					this.renderGameOver(gfx, atlas);
					break;
				case "RUNNING":
					this.renderRunning(gfx, atlas);
					this.renderFG(gfx, atlas);
					break;
				default:
					this.renderFG(gfx, atlas);
					break;
			}


			gfx.ctx.restore();

			this.flash && this.flash.render(gfx);

		},

		renderBG: function (gfx, atlas) {
			atlas.render(gfx, "bg_" + (this.bg === 1 ? "night" : "day"), 0, 0);
		},

		renderGame: function (gfx) {
			this.pipes.forEach(function (p) {
				p.render(gfx);
			});
			this.bird.render(gfx);
		},

		renderFG: function (gfx, atlas) {
			atlas.render(gfx, "land", this.bgOffset, gfx.h - 112);
			atlas.render(gfx, "land", Core.env.w + this.bgOffset, gfx.h - 112);
		},

		renderRunning: function (gfx, atlas) {
			if (this.state.count < 30) {
				gfx.ctx.globalAlpha = 1 - (this.state.count / 30);
				this.renderGetReady(gfx, atlas);
				gfx.ctx.globalAlpha = 1;
			}
			this.renderScore(gfx, atlas);
		},

		renderGameOver: function (gfx, atlas) {

			var count = this.state.count,
				yOff;

			if (count > 20) {
				yOff = Math.min(5, count - 20);
				atlas.render(gfx, "text_game_over", 40, gfx.h * 0.24 + yOff);
			}

			if (count > 70) {
				yOff = Math.max(0, 330 - (count - 70) * 20);
				atlas.render(gfx, "score_panel", 24, gfx.h * 0.38 + yOff);
				var sc = this.score + "",
					right = 218;
				for (var i = 0; i < sc.length; i++) {
					atlas.render(gfx, "number_score_0" + sc[sc.length - i - 1], right - i * 16, 231 + yOff);
				}

				sc = window.game.best + "";
				for (i = 0; i < sc.length; i++) {
					atlas.render(gfx, "number_score_0" + sc[sc.length - i - 1], right - i * 16, 272 + yOff);
				}

				var medal = "";
				if (this.score >= 5) medal = "3";
				if (this.score >= 10) medal = "2";
				if (this.score >= 20) medal = "1";
				if (this.score >= 30) medal = "0";
				if (medal) {
					atlas.render(gfx, "medals_" + medal, 55, 240 + yOff);
				}
			}

			if (count > 100) {
				atlas.render(gfx, "button_play", 20, gfx.h - 172);
				atlas.render(gfx, "button_score", 152, gfx.h - 172);
			}
		},

		renderGetReady: function (gfx, atlas) {
			//atlas.render(gfx, "text_ready", 46, gfx.h * 0.285);
			//atlas.render(gfx, "tutorial", 88, gfx.h * 0.425);

			this.renderScore(gfx, atlas);
		},

		renderScore: function (gfx, atlas) {
			var sc = this.score + "";
			for (var i = 0; i < sc.length; i++) {
				atlas.render(gfx, "font_0" + (48 + parseInt(sc[i], 10)), i * 18 + 130, gfx.h * 0.16);
			}
		}
	});

	window.MainScreen = MainScreen;

}(window.Core));


function clone(obj) {
    if (null == obj || "object" != typeof obj) return obj;
    var copy = obj.constructor();
    for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    }
    return copy;
}