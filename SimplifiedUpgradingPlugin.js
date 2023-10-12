/***
|Description|Makes upgrading work ~correctly with (at least) Timimi or MTS 1.7.0 and above (tested on 2.6.5,2.9.2,2.9.3 → 2.9.3,2.9.4), adds optional upgrade autocheck on start; adds tiddlers and fields sorting so that the changes are easier to review|
|Source     |https://github.com/YakovL/TiddlyWiki_SimplifiedUpgradingPlugin/blob/master/SimplifiedUpgradingPlugin.js|
|Author     |Yakov Litvin|
|Version    |0.6.1|
|License    |[[MIT|https://github.com/YakovL/TiddlyWiki_YL_ExtensionsCollection/blob/master/Common%20License%20(MIT)]]|
Installation of this plugin is standard: create tiddler, paste this as text, tag with {{{systemConfig}}}, save, reload.

To start upgrading, use the usual way: open backstage, the "upgrade" tab and hit the "upgrade" button.

Configuration:
<<option txtWaitSavingSeconds>> "wait saving" interval (seconds) may need adjustments for big ~TWs (otherwise, you should check that after reloading the new version is opened: if not, try to reload again)
<<option chkReloadManually>> reload manually (don't reload automatically after saving upgraded TW)
<<option chkAutocheckUpgradeOnStart>> check for upgrades on start
***/
//{{{
config.options.txtWaitSavingSeconds = config.options.txtWaitSavingSeconds || "5"; // no handler for number options

// a fix for older TWs, like 2.7.1
config.macros.upgrade.source = 'https://classic.tiddlywiki.com/upgrade/'

var upgradingEventBus = {
	handlers: {},
	// no "off" method, no array of handlers for now
	on: function(name, handler) {
		this.handlers[name] = handler
	},
	fire: function(name, params) {
		if(this.handlers[name]) this.handlers[name](params)
	}
}

config.macros.simplifiedUpgrade = {
	lingo: {
		isBackupCreatedQuestion: "Have you made a backup?",
		makeBackupCall: "Please make sure you have a backup before upgrading",
		unsupportedMtsVersionMessage: "Simplified upgrading in MainTiddlySaver below 1.7.0 is not made to work properly, aborting now",
		failedToLoadCore: "Something went wrong when loading core!",
		simplifiedUpgradingDissallowed: "The new core indicates that simplified upgrading is dangerous, please use import of your TW into a new empty TW instead",
		versionNotNewer: "The available core is not newer than the current one",
		getUpgradeFinishedReloadMessage: function() {
			return "Upgrading finished, " + (config.options.chkReloadManually ?
				"reload page to have the changes applied" :
				"will reload page to have the changes applied")
		},
		upgradeMacro: {
			statusUpgrading: "building upgraded TW and saving...",
			statusUpgradedTwSaved: "upgraded TW saved, should reload now",
			getUpgradeAvailableMessage: function(version) {
				return "An upgrade to TiddlyWiki v" + formatVersion(version) + " is available"
			}
		}
	},
	start: function(newCoreString) {
		// don't upgrade without a backup
		if(!confirm(this.lingo.isBackupCreatedQuestion)) {
			alert(this.lingo.makeBackupCall)
			return
		}

		// once MTS supports upgrading, here we will check MTS version instead [or feature-detect]
		var isMainTiddlyServerUsed = !!window.saveOnlineChanges ||
			(window.tiddlyBackend && tiddlyBackend.version && tiddlyBackend.version.title == 'MainTiddlyServer')
		if(isMainTiddlyServerUsed) {
			// for now, we assume that 1.7.0 supports upgrading (this is a matter of testing), so we don't check tiddlyBackend.version.asString
			var doesMtsSupportUpgrading = !!window.tiddlyBackend
			if(!doesMtsSupportUpgrading) {
				alert(this.lingo.unsupportedMtsVersionMessage)
				return
			}
		}

		var me = this
		if(newCoreString) {
			this.proceedWithLoadedCore(newCoreString)
		}
		else this.getNewCore(function(newCoreString) {
			upgradingEventBus.fire("available-core-loaded")
			me.proceedWithLoadedCore(newCoreString)
		}, this.onCoreLoadFail)
	},
	// onSuccess(newCoreString), onProblem(jqXHR, textStatus, errorThrown)
	getNewCore: function(onSuccess, onProblem) {
		var up = config.macros.upgrade
		var url = up.getSourceURL ? up.getSourceURL() : config.options.txtUpgradeCoreURI || up.source
		ajaxReq({
			type: "GET",
			url: url,
			processData: false,
			success: onSuccess,
			error: onProblem
		})
	},
	onCoreLoadFail: function(jqXHR, textStatus, errorThrown) {
		upgradingEventBus.fire("available-core-loading-failed")
		alert(config.macros.simplifiedUpgrade.lingo.failedToLoadCore)
	},
	getSavingWaitMillisecondsInterval: function() {
		return 1000 * parseFloat(config.options.txtWaitSavingSeconds)
	},
	overrides: {},
	// main idea: make sure loadOriginal or its async analogs will return the new core, then just save
	proceedWithLoadedCore: function(newCoreString) {
		var me = config.macros.simplifiedUpgrade
		if(newCoreString.indexOf("simplifiedUpgradingDisallowed") != -1) {
			alert(me.lingo.simplifiedUpgradingDissallowed)
			return
		}
		var availableVersion = config.macros.upgrade.extractVersion(newCoreString)
		if(compareVersions(version, availableVersion) !== 1) {
			displayMessage(me.lingo.versionNotNewer)
			return
		}

		// MainTiddlyServer: avoid granulated saving (won't change core)
		me.overrides.chkAvoidGranulatedSaving = config.options.chkAvoidGranulatedSaving
		config.options.chkAvoidGranulatedSaving = true

		me.overrides.loadOriginal = loadOriginal
		loadOriginal = function loadOriginal(localPath, callback) {
			if(!callback) return newCoreString
			callback(newCoreString)
		}
		// MTS 1.7.0
		if(window.tiddlyBackend) {
			me.overrides.tiddlyBackend_loadOriginal = tiddlyBackend.loadOriginal
			tiddlyBackend.loadOriginal = function(onSuccess) {
				onSuccess(newCoreString)
			}
		}

		saveChanges()
		// restore overrides
		loadOriginal = me.overrides.loadOriginal
		if(me.overrides.tiddlyBackend_loadOriginal) tiddlyBackend.loadOriginal = me.overrides.tiddlyBackend_loadOriginal
		config.options.chkAvoidGranulatedSaving = me.overrides.chkAvoidGranulatedSaving

		// wait so that saving finishes
		setTimeout(function() {
			upgradingEventBus.fire("upgraded-tw-saved")
			me.finalize()
		}, me.getSavingWaitMillisecondsInterval())
	},
	finalize: function() {
		var me = config.macros.simplifiedUpgrade
		alert(me.lingo.getUpgradeFinishedReloadMessage())
		if(!config.options.chkReloadManually) {
			window.location.reload()
		}
	}
}

merge(config.macros.upgrade, config.macros.simplifiedUpgrade.lingo.upgradeMacro)

config.macros.upgrade.onLoadCore = function(status, params, responseText, url, xhr) {

	var me = config.macros.upgrade
	var w = params
	var errMsg = !status ? me.errorLoadingCore : undefined
	var newVer = me.extractVersion(responseText)
	if(!newVer) errMsg = me.errorCoreFormat
	if(errMsg) {
		w.setButtons([], errMsg)
		alert(errMsg)
		return
	}

	// the overridden bit
	var onStartUpgrade = function(e) {
		w.setButtons([], me.statusUpgrading)
		upgradingEventBus.on("upgraded-tw-saved", function() {
			w.setButtons([], me.statusUpgradedTwSaved)
		})
		config.macros.simplifiedUpgrade.start(responseText)
	}

	var step2 = [me.step2Html_downgrade, me.step2Html_restore, me.step2Html_upgrade][compareVersions(version, newVer) + 1];
	w.addStep(me.step2Title, step2.format([formatVersion(newVer), formatVersion(version)]));
	w.setButtons([
		{ caption: me.startLabel, tooltip: me.startPrompt, onClick: onStartUpgrade },
		{ caption: me.cancelLabel, tooltip: me.cancelPrompt, onClick: me.onCancel }
	])
}

var isBelow2_9_3 = compareVersions(version, { major: 2, minor: 9, revision: 3 }) === 1
var isAbove2_9_3 = compareVersions(version, { major: 2, minor: 9, revision: 3 }) === -1

// support upgrading regardless the whitespace after '{' (extra spaces were in 2.9._)
if(isBelow2_9_3) {
	config.macros.upgrade.extractVersion = function(upgradeFile) {
		var re = /version = \{\s*title: "([^"]+)", major: (\d+), minor: (\d+), revision: (\d+)(, beta: (\d+)){0,1}, date: new Date\("([^"]+)"\)/mg
		var m = re.exec(upgradeFile)
		return !m ? null : {
			title: m[1], major: m[2], minor: m[3], revision: m[4], beta: m[6], date: new Date(m[7])
		}
	}
}

// fix the bug introduced in 2.9.3 and fixed in 2.9.4 version
if(!isAbove2_9_3) {
	// not present before 2.9.2
	config.macros.upgrade.getSourceURL = function() {
		return config.options.txtUpgradeCoreURI || config.macros.upgrade.source
	}

	config.macros.upgrade.onClickUpgrade = function(e)
	{
		var me = config.macros.upgrade
		var w = new Wizard(this)
		if(window.allowSave && !window.allowSave()) {
			alert(me.errorCantUpgrade)
			return false
		}
		if(story.areAnyDirty() || store.isDirty()) {
			alert(me.errorNotSaved)
			return false
		}

		w.setButtons([], me.statusPreparingBackup)
		var localPath = getLocalPath(document.location.toString())
		var backupPath = getBackupPath(localPath, me.backupExtension)
		var original = loadOriginal(localPath)

		w.setButtons([], me.statusSavingBackup)
		var backupSuccess = copyFile(backupPath, localPath) || saveFile(backupPath, original)
		//# fails of backup saving with TF are not reported, resulting in empty TW after upgrade
		if(!backupSuccess) {
			w.setButtons([], me.errorSavingBackup)
			alert(me.errorSavingBackup)
			return false
		}
		w.setValue("backupPath", backupPath)

		w.setButtons([], me.statusLoadingCore)
		var sourceURL = me.getSourceURL()
		ajaxReq({
			type: "GET",
			url: sourceURL,
			processData: false,
			success: function(data, textStatus, jqXHR) {
				me.onLoadCore(true, w, jqXHR.responseText, sourceURL, jqXHR)
			},
			error: function(jqXHR, textStatus, errorThrown) {
				me.onLoadCore(false, w, null, sourceURL, jqXHR)
			}
		})
		return false
	}
}

// auto-checking available upgrade
config.macros.upgrade.init = function() {
	config.macros.simplifiedUpgrade.getNewCore(function(coreAsText) {
		var me = config.macros.upgrade
		var availableVersion = me.extractVersion(coreAsText)
		if(compareVersions(version, availableVersion) !== 1) return
		if(config.options.chkAutocheckUpgradeOnStart) {
			displayMessage(me.getUpgradeAvailableMessage(availableVersion))
		}
	})
}

if(!isAbove2_9_3) {
	SaverBase.prototype.externalize = function(store) {
		var results = [];
		var i, tiddlers = store.getTiddlers("title");
		if(!config.options.chkAvoidSortingAll) {
			tiddlers.sort(function(t1, t2) {
				return t1.title.localeCompare(t2.title)
			});
		}
		for(i = 0; i < tiddlers.length; i++) {
			if(!tiddlers[i].doNotSave())
				results.push(this.externalizeTiddler(store, tiddlers[i]));
		}
		return results.join("\n");
	};

	TW21Saver.prototype.externalizeTiddler = function(store, tiddler)
	{
		try {
			var usePre = config.options.chkUsePreForStorage;
			var created = tiddler.created;
			var modified = tiddler.modified;
			var tags = tiddler.getTags();
			var attributes =
				(tiddler.creator ? ' creator="' + tiddler.creator.htmlEncode() + '"' : "") +
				(tiddler.modifier ? ' modifier="' + tiddler.modifier.htmlEncode() + '"' : "") +
				((usePre && created == version.date) ? "" : ' created="' + created.convertToYYYYMMDDHHMM() + '"') +
				((usePre && modified == created) ? "" : ' modified="' + modified.convertToYYYYMMDDHHMM() + '"') +
				((!usePre || tags) ? ' tags="' + tags.htmlEncode() + '"' : "");
			//# todo: check if these changes (sort extended attributes so that the order is always the same) affect performance, commit
			var extendedAttributes = [];
			store.forEachField(tiddler, function(tiddler, fieldName, value) {
				if(typeof value != "string")
					value = "";
				// don't store fields from the temp namespace
				if(!fieldName.match(/^temp\./))
					extendedAttributes.push('%0="%1"'.format([fieldName, value.escapeLineBreaks().htmlEncode()]));
			}, true);
			if(!config.options.chkAvoidSortingAll) {
				extendedAttributes.sort();
			}
			//# avoid closing div tags for _
			return ('<div %0="%1"%2%3>%4</' + 'div>').format([
				usePre ? "title" : "tiddler",
				tiddler.title.htmlEncode(),
				attributes,
				' ' + extendedAttributes.join(' '),
				usePre ? "\n<pre>" + tiddler.text.htmlEncode() + "</pre>\n" : tiddler.text.escapeLineBreaks().htmlEncode()
			]);
		} catch (ex) {
			throw exceptionText(ex, config.messages.tiddlerSaveError.format([tiddler.title]));
		}
	};
}
//}}}