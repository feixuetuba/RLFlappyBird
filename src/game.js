(function (Core) {

    "use strict";

    var OmegaGame = Core.Game.extend({

        canvas: "#board",

        fps: true,
        best: 0,

        atlas: new Core.SpriteAtlas("csv", "res/flappyAtlas/atlas"),

        init: function (w, h) {

            this._super(w, h);

            Core.evt.progress.push(function (remaining, max) {
                console.log((((max - remaining) / max) * 100 | 0) + "%");
            });

            Core.input.bind({
                "jump": ["space", "mouse1"] ,
                "touch": "touch",
                "escape": "escape",
                "left": "left",
                "right": "right",
                "up": "up",
                "down": "down"
            });

        },

        load: function () {

            this.setScreen(new TitleScreen());

        }

    });

    window.OmegaGame = OmegaGame;

}(Core));
