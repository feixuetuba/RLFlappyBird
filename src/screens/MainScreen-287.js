(function (Core) {

	"use strict";
	
	var MainScreen = Core.Screen.extend({

		speed:  3,
		bird: null,
		pipes: null,

		score: 0,
		maxScore: 0,
		latest_score: 0,
		state: null,
		debugColor: 0x000079,
		debugColorStr: '#000079',
		
		bg: 0,
		bgOffset: 0,

		sounds: {
			"point": new Core.Sound("res/audio/sfx_point", 1),
			"hit": new Core.Sound("res/audio/sfx_hit", 1)
		},

		shake: null,
		flash: null,
		debug_load: false,


		
		latest_state: {"vertical_distance": 0, "horizontal_distance": 0},
		latest_action: "do_nothing",
		startTime: 0,
		explore: 0.00,
		resolution: 1,
		hscale: 10,
		vscale: 8,
		learning_rate: 0.7,
		vertical_dist_range: [-350, 190],
		horizontal_dist_range: [0, 200],
		vertical_state_range: 11,
		horizontal_state_range: 11,
		trainTimes: 0,
		h_sequences:[],
		h_seq_index:0,

		min_diff: 9999, 
		max_diff: -9999, 

		init: function () {
			this.reset();

			// Vertical Distance
			this.Q = new Array();
			//for (var vert_dist = 0; vert_dist < (this.vertical_dist_range[1] - this.vertical_dist_range[0])/this.resolution; vert_dist++) {
			for (var vert_dist = 0; vert_dist < this.vertical_state_range + 1; vert_dist++) {
				this.Q[vert_dist] = new Array();

				// Horizontal Distance
				for (var hori_dist = 0; hori_dist < this.horizontal_state_range + 1; hori_dist++) {
					this.Q[vert_dist][hori_dist] = {"click": 0, "do_nothing": 0};
				}
			}
			this.h_sequences = new Array();
			this.startTime = Date.parse(new Date());
			this.printState();
		},


		reset: function () {
			this.score = 0;
			//var offset = Core.env.w;
			var offset = -0.4 * Core.env.w;
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
			this.updateDuration();
			this.updateMaxScore();
			this.state.tick();
			this.bird.tick();

			var valid = false;
			var reward = 0;

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
			
			var state_now_v = 0;
			if(vertical_distance > 0)
				state_now_v = this.vertical_state_range -1;
			else if(vertical_distance < -70)
				state_now_v = 0;
			else
				state_now_v = Math.floor(
					-vertical_distance / this.vscale) + 1;
			
			var state_now_h = horizontal_distance;	
			state_now_h = Math.floor( horizontal_distance/this.hscale);
			state_now_h = Math.min(state_now_h, this.horizontal_state_range - 1);

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
					reward = -100;
					this.latest_score = 0;
					break;


				case "GAMEOVER":
					if (this.state.first()) {
						if (this.score > window.game.best) {
							window.game.best = this.score;
						}
					}
					reward = -100;
					this.latest_score = 0;
					this.sounds.hit.play();
					valid = true;
					
					break;
			}
			
			if(this.latest_state.vertical_distance == state_now_v &&
				this.latest_state.horizontal_distance == state_now_h && this.state.get() != "GAMEOVER")
				valid = false;
			//console.info(state_now_v+"."+state_now_h);
			if(valid){
				var now_Q = this.Q[state_now_v][state_now_h];
				var predict_reward = Math.max(now_Q['click'], now_Q['do_nothing']);

				var state_bin_v = this.latest_state.vertical_distance;
				var state_bin_h = this.latest_state.horizontal_distance;
				
				this.showState(state_now_v, state_now_h, state_bin_v, state_bin_h);
				
				var latest_reward = this.Q[state_bin_v][state_bin_h][this.latest_action];
				this.Q[state_bin_v][state_bin_h][this.latest_action] = 
					latest_reward + this.learning_rate * (reward + predict_reward -latest_reward);
					//Q_s_a + this.alpha_QL * (reward + V_s_dash_a_dash - Q_s_a);

				//console.info("Q["+state_bin_v+","+state_bin_h+","+this.latest_action+
				//	"]:"+latest_reward+"->"+this.Q[state_bin_v][state_bin_h][this.latest_action]);	
				this.latest_state.vertical_distance = state_now_v;
				this.latest_state.horizontal_distance = state_now_h;
				
				if(this.state.get() != "GAMEOVER"){
					// Step 1: Select and perform Action A
					if (Math.random() < this.explore) {
						this.latest_action = Core.utils.rand(2) == 0 ? "click" : "do_nothing";
					}
					else {
						this.latest_action = now_Q['click'] > now_Q['do_nothing'] ? "click" : "do_nothing";
					}

					//console.log("action performed: " + this.action_to_perform);
					
					if (this.latest_action == "click") {
						this.bird.performJump();
					}
				}else{
					this.h_seq_index = 0;
					this.reset();
					this.state.set("BORN");
					this.changeDebugColor();
					this.updateTrainTimes();
					this.latest_state.vertical_distance = this.vertical_state_range;
					this.latest_state.horizontal_distance = this.horizontal_state_range - 1;
				}
			}
			
			if (this.shake && !this.shake.tick()) {
				this.shake = null;
			}
			if (this.flash && !this.flash.tick()) {
				this.flash = null;
			}

		},


		changeDebugColor: function(){
			this.debugColor = (this.debugColor + 84) & 0xffffff;
			this.debugColorStr = '#' + this.debugColor .toString(16);
		},
		
		printState: function () {

			$("#debug").text("");
			var debugStr = "";
			debugStr += "<table style='float: left'><tr><th>items</th><th>values</th></tr>";
			debugStr += "<tr><td>max score</td><td id='max_score''>0</td></tr>";
			debugStr += "<tr><td>duration</td><td id='duration'>0</td></tr>";
			debugStr += "<tr><td>train times</td><td id='train_times'>0</td></tr>";
			debugStr += "<tr><td>frame rate</td><td ><input type='text' id='frame_rate'/></td></tr>";
			debugStr += "</table>";
			debugStr += "<table><tr><th>idx</th>";
			for (var hori_dist = 0; hori_dist < this.horizontal_state_range; ++ hori_dist){
				debugStr += ("<th>" + hori_dist + "</th>");
			}
			debugStr += "</tr>" ;
			for (var vert_dist = 0; vert_dist < this.vertical_state_range + 1; vert_dist++) {
				debugStr += "<tr><td>" + vert_dist + '</td>';
				// Horizontal Distance
				for (var hori_dist = 0; hori_dist < this.horizontal_state_range; ++hori_dist) {
				
					//var debug_char = this.Q[vert_dist][hori_dist]["click"] > this.Q[vert_dist][hori_dist]["do_nothing"] ? 'c' : '-';
					//$("#debug").append(debug_char);
					debugStr += "<td id='"+vert_dist+"_"+hori_dist+"'>" + '-' + "</td>";
				}
				debugStr += "</tr>";
			}
			debugStr += "</table>";
			$("#debug").append(debugStr);
		},

		showState: function(vert_dist, hori_dist, old_ver, old_hori){
			var debug_char = this.Q[vert_dist][hori_dist]["click"] > this.Q[vert_dist][hori_dist]["do_nothing"] ? 'c' : 'n';
			$("#"+vert_dist+"_"+hori_dist).text(debug_char);
			$("#"+vert_dist+"_"+hori_dist).css('background-color',this.debugColorStr);
			//$("#"+old_ver+"_"+old_hori).css('color','black');
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
			/*
			if(this.h_seq_index >= this.h_sequences.length){
				h = (Math.random() * 160 | 0) + 130;
				if(this.h_sequences.length > 200)
					this.h_sequences/splice(0,this.h_sequences.length);
				this.h_sequences.push(h);
			}
			else
				h = this.h_sequences[this.h_seq_index ++ ];
			*///var h = 130;
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