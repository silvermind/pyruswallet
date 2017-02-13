'use strict';
var swapCtrl = function($scope, $sce, walletService) {
    var lStorageKey = "swapOrder";
    $scope.ajaxReq = ajaxReq;
    $scope.Validator = Validator;
    $scope.bity = new bity();
    $scope.bity.refreshRates(function() {
        $scope.setOrderCoin(true, "ETH");
    });
    $scope.priceTicker = { ETHBTC: 1, ETHREP: 1, BTCREP: 1, BTCETH: 1, REPBTC: 1, REPETH: 1 };
    $scope.availableCoins = ["ETH", "BTC", "REP"];
    var initValues = function() {
        $scope.showStage1 = true;
        $scope.showStage2 = $scope.showStage3Eth = $scope.showStage3Btc = false;
        $scope.orderResult = null;
        $scope.swapOrder = {
            fromCoin: "ETH",
            toCoin: "BTC",
            isFrom: true,
            fromVal: '',
            toVal: '',
            toAddress: '',
            swapRate: '',
            swapPair: ''
        }
    }
    $scope.setOrderCoin = function(isFrom, coin) {
        if (isFrom) $scope.swapOrder.fromCoin = coin;
        else $scope.swapOrder.toCoin = coin;
        if ($scope.swapOrder.fromCoin == $scope.swapOrder.toCoin)
            for (var i in $scope.availableCoins)
                if ($scope.availableCoins[i] != $scope.swapOrder.fromCoin) {
                    $scope.swapOrder.toCoin = $scope.availableCoins[i];
                    break;
                }
        $scope.swapOrder.swapRate = $scope.bity.curRate[$scope.swapOrder.fromCoin + $scope.swapOrder.toCoin];
        $scope.swapOrder.swapPair = $scope.swapOrder.fromCoin + "/" + $scope.swapOrder.toCoin;
        $scope.updateEstimate(isFrom);
        $scope.dropdownFrom = $scope.dropdownTo = false;
    }
    $scope.updateEstimate = function(isFrom) {
        if (isFrom) $scope.swapOrder.toVal = parseFloat(($scope.bity.curRate[$scope.swapOrder.fromCoin + $scope.swapOrder.toCoin] * $scope.swapOrder.fromVal).toFixed(bity.decimals));
        else $scope.swapOrder.fromVal = parseFloat(($scope.swapOrder.toVal / $scope.bity.curRate[$scope.swapOrder.fromCoin + $scope.swapOrder.toCoin]).toFixed(bity.decimals));
        $scope.swapOrder.isFrom = isFrom;
    }
    $scope.setFinalPrices = function() {
        try {

            if (!$scope.Validator.isPositiveNumber($scope.swapOrder.fromVal) || !$scope.Validator.isPositiveNumber($scope.swapOrder.toVal)) throw globalFuncs.errorMsgs[0];
            else if ($scope.swapOrder.fromVal < 0.01 || $scope.swapOrder.toVal < 0.01) throw globalFuncs.errorMsgs[27];
            $scope.bity.refreshRates(function() {
                $scope.updateEstimate($scope.swapOrder.isFrom);
                $scope.showStage1 = false;
                $scope.showStage2 = true;
            });
        } catch (e) {
            $scope.notifier.danger(e);
        }

    }
    var getProgressBarArr = function(index, len) {
        var tempArr = [];
        for (var i = 0; i < len; i++) {
            if (i < index) tempArr.push('progress-true');
            else if (i == index) tempArr.push('progress-active');
            else tempArr.push('');
        }
        return tempArr;
    }
    var isStorageOrderExists = function() {
        var order = localStorage.getItem(lStorageKey);
        return order && $scope.Validator.isJSON(order);
    }
    var setOrderFromStorage = function() {
        var order = JSON.parse(localStorage.getItem(lStorageKey));
        $scope.orderResult = order;
        $scope.swapOrder = order.swapOrder;
        processOrder();
    }
    var saveOrderToStorage = function(order) {
        localStorage.setItem(lStorageKey, JSON.stringify(order));
    }
    var processOrder = function() {
        var orderResult = $scope.orderResult;
        orderResult.progress = {
            status: "OPEN",
            bar: getProgressBarArr(1, 5),
            showTimeRem: true,
            timeRemaining: '10:00',
            secsRemaining: orderResult.validFor - parseInt((new Date().getTime() - new Date(orderResult.timestamp_created).getTime()) / 1000),
            pendingStatusReq: false
        };
        var timeRem = setInterval(function() {
            if (!orderResult) clearInterval(timeRem);
            if (orderResult.progress.secsRemaining > 0) {
                if (orderResult.progress.status == "OPEN")
                    orderResult.progress.secsRemaining--;
                else
                    orderResult.progress.secsRemaining++;
                var minutes = Math.floor(orderResult.progress.secsRemaining / 60);
                var seconds = orderResult.progress.secsRemaining - minutes * 60;
                minutes = minutes < 10 ? '0' + minutes : minutes;
                seconds = seconds < 10 ? '0' + seconds : seconds;
                orderResult.progress.timeRemaining = minutes + ':' + seconds;
                if (!$scope.$$phase) $scope.$apply();
            } else {
                orderResult.progress.timeRemaining = "00:00";
                clearInterval(timeRem);
            }
        }, 1000);
        var progressCheck = setInterval(function() {
            if (!orderResult) clearInterval(progressCheck);
            if (!orderResult.progress.pendingStatusReq) {
                orderResult.progress.pendingStatusReq = true;
                $scope.bity.getStatus({ orderid: orderResult.id }, function(data) {
                    if (data.error) $scope.notifier.danger(data.msg);
                    else {
                        data = data.data;
                        if (bity.validStatus.indexOf(data.status) != -1) orderResult.progress.status = "RCVE";
                        if (orderResult.progress.status == "OPEN" && bity.validStatus.indexOf(data.input.status) != -1) {
                            orderResult.progress.secsRemaining = 1;
                            orderResult.progress.showTimeRem = false;
                            orderResult.progress.status = "RCVE";
                            orderResult.progress.bar = getProgressBarArr(3, 5);
                        } else if (orderResult.progress.status == "RCVE" && bity.validStatus.indexOf(data.output.status) != -1) {
                            uiFuncs.notifier.close();
                            orderResult.progress.status = "FILL";
                            orderResult.progress.bar = getProgressBarArr(5, 5);
                            var url = orderResult.output.currency == 'BTC' ? bity.btcExplorer.replace("[[txHash]]", data.output.reference) : bity.ethExplorer.replace("[[txHash]]", data.output.reference)
                            var bExStr = "<a href='" + url + "' target='_blank'> View your transaction </a>";
                            $scope.notifier.success(globalFuncs.successMsgs[2] + data.output.reference + "<br />" + bExStr);
                            clearInterval(progressCheck);
                            clearInterval(timeRem);
                        } else if (bity.invalidStatus.indexOf(data.status) != -1) {
                            orderResult.progress.status = "CANC";
                            orderResult.progress.bar = getProgressBarArr(-1, 5);
                            $scope.notifier.danger("Order cancelled");
                            orderResult.progress.secsRemaining = 0;
                            clearInterval(progressCheck);
                        }
                        if (!$scope.$$phase) $scope.$apply();
                    }
                    orderResult.progress.pendingStatusReq = false;
                });
            }
        }, 1000);
        $scope.showStage2 = false;
        if ($scope.orderResult.input.currency == 'BTC') $scope.showStage3Btc = true;
        else {
            $scope.parentTxConfig = {
                to: $scope.orderResult.payment_address,
                value: $scope.orderResult.input.amount,
                sendMode: $scope.orderResult.input.currency == 'ETH' ? 'ether' : 'token',
                tokenSymbol: $scope.orderResult.input.currency == 'ETH' ? '' : $scope.orderResult.input.currency
            }
            new Modal(document.getElementById('sendTransaction'));
            $scope.showStage3Eth = true;
        }
    }
    $scope.openOrder = function() {

        if (($scope.swapOrder.toCoin != 'BTC' && $scope.Validator.isValidAddress($scope.swapOrder.toAddress)) || ($scope.swapOrder.toCoin == 'BTC' && $scope.Validator.isValidBTCAddress($scope.swapOrder.toAddress))) {
            var order = {
                amount: $scope.swapOrder.isFrom ? $scope.swapOrder.fromVal : $scope.swapOrder.toVal,
                mode: $scope.swapOrder.isFrom ? 0 : 1,
                pair: $scope.swapOrder.fromCoin + $scope.swapOrder.toCoin,
                destAddress: $scope.swapOrder.toAddress
            }
            $scope.bity.openOrder(order, function(data) {
                if (!data.error) {
                    $scope.orderResult = data.data;
                    $scope.orderResult.swapOrder = $scope.swapOrder;
                    var orderResult = $scope.orderResult;
                    saveOrderToStorage(orderResult);
                    processOrder();
                } else $scope.notifier.danger(data.msg);
                if (!$scope.$$phase) $scope.$apply();
            });
        } else {
            $scope.notifier.danger(globalFuncs.errorMsgs[5]);
        }
    }
    $scope.newSwap = function() {
        localStorage.setItem(lStorageKey, '');
        initValues();
    }
    initValues();
    if (isStorageOrderExists()) {
        $scope.showStage1 = false;
        setOrderFromStorage();
    }
};
module.exports = swapCtrl;
